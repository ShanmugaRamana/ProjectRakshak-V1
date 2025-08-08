import cv2
import numpy as np
import threading
import requests
import base64
from flask import Flask, Response, request, jsonify # Ensure request and jsonify are imported at the top
from pymongo import MongoClient
from ultralytics import YOLO
from insightface.app import FaceAnalysis
from scipy.spatial.distance import cosine

# ---------------------- CONFIGURATION ----------------------
MONGO_URI = "mongodb+srv://ramana:development2025@development.nelvrt9.mongodb.net/rakshak?retryWrites=true&w=majority&appName=development"
NODE_API_URL = "http://localhost:3000/api/report_match"
SIMILARITY_THRESHOLD = 0.5
DETECTION_INTERVAL = 5
VERIFICATION_THRESHOLD = 0.6  # Threshold for face verification in the form
DUPLICATE_THRESHOLD = 0.7 
# ---------------------- INITIALIZATION ----------------------
app = Flask(__name__)

# --- Database ---
try:
    client = MongoClient(MONGO_URI)
    db = client['rakshak']
    people_collection = db['people']
    print("MongoDB connected successfully.")
except Exception as e:
    print(f"Error connecting to MongoDB: {e}")
    exit()

# --- AI Models ---
print("Initializing AI models...")
yolo_model = YOLO('yolo11n.pt')
face_app = FaceAnalysis(name="buffalo_l", providers=['CPUExecutionProvider'])
face_app.prepare(ctx_id=0)
print("AI models initialized.")

# --- Global In-memory Face Database ---
db_faces = []
pending_matches = set()
db_lock = threading.Lock()

# ---------------------- CORE FUNCTIONS ----------------------

def process_person_doc(doc):
    mongo_id = str(doc['_id'])
    full_name = doc.get('fullName', 'Unknown')
    images = doc.get('images', [])
    new_faces = []
    for img_obj in images:
        if 'data' in img_obj:
            binary_data = img_obj['data']
            img_array = np.frombuffer(binary_data, dtype=np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            if img is not None:
                faces = face_app.get(img)
                if faces:
                    embedding = faces[0].embedding
                    new_faces.append({'mongo_id': mongo_id, 'name': full_name, 'embedding': embedding})
    return new_faces

def load_initial_faces():
    print("Loading initial set of faces from database...")
    with db_lock:
        db_faces.clear()
        for doc in people_collection.find({"status": "Lost"}):
            processed_faces = process_person_doc(doc)
            if processed_faces:
                db_faces.extend(processed_faces)
                print(f"[Initial Load] Loaded {len(processed_faces)} face(s) for {doc['fullName']}")
    print(f"--- Initial load complete. Total unique embeddings: {len(db_faces)} ---")

def watch_for_new_people():
    pipeline = [{'$match': {'operationType': 'insert'}}]
    with people_collection.watch(pipeline) as stream:
        print("[Watcher] Monitoring MongoDB for new inserts...")
        for change in stream:
            new_doc = change['fullDocument']
            print(f"[Watcher] Detected new person: {new_doc['fullName']}")
            processed_faces = process_person_doc(new_doc)
            if processed_faces:
                with db_lock:
                    db_faces.extend(processed_faces)
                print(f"[Watcher] Added {len(processed_faces)} new face(s) for {new_doc['fullName']} to live search.")

def start_camera_and_recognition():
    cap = cv2.VideoCapture(0)
    frame_count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to capture frame. Retrying...")
            cap.release()
            cap = cv2.VideoCapture(1)
            continue
        frame_count += 1
        with db_lock:
            current_db_faces = list(db_faces)
        if frame_count % DETECTION_INTERVAL == 0 and current_db_faces:
            results = yolo_model(frame, verbose=False)[0]
            for box in results.boxes:
                if int(box.cls[0]) == 0:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    face_crop = frame[y1:y2, x1:x2]
                    if face_crop.size == 0: continue
                    faces = face_app.get(face_crop)
                    if faces:
                        live_embedding = faces[0].embedding
                        best_match_name = "Unknown"
                        best_match_id = None
                        best_similarity = 0
                        for db_face in current_db_faces:
                            if db_face['mongo_id'] in pending_matches:
                                continue
                            similarity = 1 - cosine(live_embedding, db_face['embedding'])
                            if similarity > SIMILARITY_THRESHOLD and similarity > best_similarity:
                                best_similarity = similarity
                                best_match_name = db_face['name']
                                best_match_id = db_face['mongo_id']
                        if best_match_id:
                            print(f"Match found: {best_match_name} ({best_similarity:.2f})")
                            pending_matches.add(best_match_id)
                            _, buffer = cv2.imencode('.jpg', face_crop)
                            snapshot_b64 = base64.b64encode(buffer).decode('utf-8')
                            payload = {
                                "mongo_id": best_match_id,
                                "name": best_match_name,
                                "snapshot": snapshot_b64
                            }
                            try:
                                requests.post(NODE_API_URL, json=payload, timeout=2)
                            except requests.RequestException as e:
                                print(f"Error reporting match to Node.js: {e}")
                                pending_matches.remove(best_match_id)
                        color = (0, 255, 0) if best_match_id else (0, 0, 255)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(frame, best_match_name, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        (flag, encodedImage) = cv2.imencode(".jpg", frame)
        if not flag: continue
        yield(b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + bytearray(encodedImage) + b'\r\n')

# ---------------------- FLASK WEB SERVER ----------------------

### --- NEWLY ADDED FORM LOGIC --- ###
@app.route('/detect', methods=['POST'])
def detect_face_in_form():
    """Handles single image validation from the web form."""
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file:
        try:
            filestr = file.read()
            npimg = np.frombuffer(filestr, np.uint8)
            image = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

            # Use the powerful insightface model already loaded in memory
            detected_faces = face_app.get(image)
            face_count = len(detected_faces)

            if face_count == 0:
                return jsonify({"success": False, "message": "No face was detected in the image.", "face_count": 0})
            elif face_count == 1:
                return jsonify({"success": True, "message": "Exactly one face was detected.", "face_count": 1})
            else:
                return jsonify({"success": False, "message": f"More than one face detected. Found {face_count} faces.", "face_count": face_count})
        except Exception as e:
            return jsonify({"error": f"An error occurred during processing: {str(e)}"}), 500

    return jsonify({"error": "Invalid file"}), 400

@app.route('/verify_faceset', methods=['POST'])
def verify_faceset():
    """
    Handles a set of uploaded images. It verifies three things:
    1. Each image contains exactly one face.
    2. All faces in the set belong to the same person.
    3. The person is not a duplicate of someone already in the database.
    """
    files = request.files.getlist('images')

    if not (3 <= len(files) <= 7):
        return jsonify({"success": False, "message": f"Invalid number of images. Expected 3-7, got {len(files)}."})

    embeddings = []
    for idx, file in enumerate(files):
        try:
            npimg = np.frombuffer(file.read(), np.uint8)
            image = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
            
            detected_faces = face_app.get(image)
            face_count = len(detected_faces)

            if face_count == 0:
                return jsonify({"success": False, "message": f"No face was detected in image {idx + 1} ({file.filename})."})
            if face_count > 1:
                return jsonify({"success": False, "message": f"More than one face detected in image {idx + 1} ({file.filename})."})
            
            embeddings.append(detected_faces[0].embedding.astype('float32'))

        except Exception as e:
            return jsonify({"success": False, "message": f"Error processing image {idx + 1}: {str(e)}"})

    # 1. Verify all faces in the set belong to the same person
    reference_embedding = embeddings[0]
    for i in range(1, len(embeddings)):
        similarity = 1 - cosine(reference_embedding, embeddings[i])
        if similarity < VERIFICATION_THRESHOLD:
            return jsonify({
                "success": False, 
                "message": f"The face in image {i + 1} does not appear to be the same person as in the first image."
            })

    # 2. Check if this person already exists in the database
    with db_lock:
        current_db_faces = list(db_faces)
    
    for db_face in current_db_faces:
        similarity = 1 - cosine(reference_embedding, db_face['embedding'])
        if similarity > DUPLICATE_THRESHOLD:
            return jsonify({
                "success": False, 
                "message": f"This person appears to be a duplicate of '{db_face['name']}' who is already in the system."
            })

    # If all checks pass
    return jsonify({"success": True, "message": "All images are valid, faces match, and no duplicates found."})
    
    
@app.route("/video_feed")
def video_feed():
    """This is the endpoint the dashboard's <img> tag will point to."""
    return Response(start_camera_and_recognition(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/update_search_status", methods=['POST'])
def update_search_status():
    """API for Node.js to tell us when to 'accept' or 're-search' a person."""
    data = request.json
    person_id = data.get('mongo_id')
    action = data.get('action') # "accept" or "research"

    if person_id and action:
        if action == "accept":
            if person_id in pending_matches:
                pending_matches.remove(person_id)
            print(f"Action 'accept' for {person_id}. They will not be searched for again until restart.")
        elif action == "research":
            if person_id in pending_matches:
                pending_matches.remove(person_id)
                print(f"Action 'research' for {person_id}. Re-enabling search.")
        return jsonify({"status": "ok"}), 200
    return jsonify({"status": "error", "message": "Invalid data"}), 400

# ---------------------- MAIN EXECUTION ----------------------
if __name__ == '__main__':
    load_initial_faces()
    watcher_thread = threading.Thread(target=watch_for_new_people, daemon=True)
    watcher_thread.start()
    print("Starting Flask server...")
    app.run(host='0.0.0.0', port=5001, debug=False)