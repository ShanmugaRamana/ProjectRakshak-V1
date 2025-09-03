import os
import cv2
import numpy as np
import threading
import requests
import base64
import time
from flask import Flask, Response, request, jsonify
from flask_cors import CORS # <-- ADD THIS LINE
from pymongo import MongoClient
from ultralytics import YOLO
from insightface.app import FaceAnalysis
from scipy.spatial.distance import cosine
from dotenv import load_dotenv

load_dotenv()

# ---------------------- CONFIGURATION ----------------------
MONGO_URI = os.getenv("MONGO_URI")
print("Mongo URI:", MONGO_URI)

NODE_API_URL = "http://localhost:3000/api/report_match"
CAMERA_SOURCES = [0, 1]  # 0 = default webcam, 1 = external webcam
SIMILARITY_THRESHOLD = 0.5
DETECTION_INTERVAL = 5
VERIFICATION_THRESHOLD = 0.6
DUPLICATE_THRESHOLD = 0.7

# ---------------------- INITIALIZATION ----------------------
app = Flask(__name__)
CORS(app) # <-- ADD THIS LINE

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

# --- Global State Management ---
db_faces = []
pending_matches = set()
permanently_found_ids = set() # <-- ADD THIS LINE
db_lock = threading.Lock()
latest_frames = {}  # Stores the latest processed frame for each camera
frame_locks = {cam_id: threading.Lock() for cam_id in CAMERA_SOURCES}

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
            if new_doc.get('status', 'Found') == 'Lost':
                print(f"[Watcher] Detected new person: {new_doc['fullName']}")
                processed_faces = process_person_doc(new_doc)
                if processed_faces:
                    with db_lock:
                        db_faces.extend(processed_faces)
                    print(f"[Watcher] Added {len(processed_faces)} new face(s) for {new_doc['fullName']} to live search.")

# In recognition_service.py

def process_camera_stream(camera_id):
    """Continuously captures and processes frames from a single camera source in a thread."""
    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        print(f"!!!FATAL: Could not open camera {camera_id}. This thread will exit.!!!")
        return
        
    frame_count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            print(f"Camera {camera_id}: Lost connection. Retrying...")
            cap.release(); time.sleep(2); cap = cv2.VideoCapture(camera_id)
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
                        best_match_name, best_match_id, best_similarity = "Unknown", None, 0
                        for db_face in current_db_faces:
                            if db_face['mongo_id'] in permanently_found_ids: continue
                            if db_face['mongo_id'] in pending_matches: continue
                            similarity = 1 - cosine(live_embedding, db_face['embedding'])
                            if similarity > SIMILARITY_THRESHOLD and similarity > best_similarity:
                                best_similarity, best_match_name, best_match_id = similarity, db_face['name'], db_face['mongo_id']
                        
                        if best_match_id:
                            print(f"Match found on Camera {camera_id}: {best_match_name}")
                            pending_matches.add(best_match_id)
                            _, buffer = cv2.imencode('.jpg', face_crop)
                            snapshot_b64 = base64.b64encode(buffer).decode('utf-8')
                            payload = {
                                "mongo_id": best_match_id, "name": best_match_name,
                                "snapshot": snapshot_b64, "camera_name": f"Camera C{camera_id + 1}"
                            }
                            
                            # --- NEW: More Robust Reporting and Logging ---
                            try:
                                print(f"--> Attempting to report match for {best_match_name} to {NODE_API_URL}")
                                response = requests.post(NODE_API_URL, json=payload, timeout=3)
                                # Raise an error if the server responded with 4xx or 5xx status
                                response.raise_for_status() 
                                print(f"<-- Successfully reported match. Node.js responded with status: {response.status_code}")
                            except requests.RequestException as e:
                                print(f"!!! ERROR reporting match to Node.js: {e}")
                                pending_matches.remove(best_match_id)
                            
                        color = (0, 255, 0) if best_match_id else (0, 0, 255)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(frame, best_match_name, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        
        # Store the latest processed frame
        with frame_locks[camera_id]:
            _, buffer = cv2.imencode('.jpg', frame)
            latest_frames[camera_id] = buffer.tobytes()


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

    
    reference_embedding = embeddings[0]
    for i in range(1, len(embeddings)):
        similarity = 1 - cosine(reference_embedding, embeddings[i])
        if similarity < VERIFICATION_THRESHOLD:
            return jsonify({
                "success": False, 
                "message": f"The face in image {i + 1} does not appear to be the same person as in the first image."
            })

   
    with db_lock:
        current_db_faces = list(db_faces)
    
    for db_face in current_db_faces:
        similarity = 1 - cosine(reference_embedding, db_face['embedding'])
        if similarity > DUPLICATE_THRESHOLD:
            return jsonify({
                "success": False, 
                "message": f"This person appears to be a duplicate of '{db_face['name']}' who is already in the system."
            })

    
    return jsonify({"success": True, "message": "All images are valid, faces match, and no duplicates found."})

@app.route('/video_feed/<int:camera_id>')
def video_feed(camera_id):
    """Streams the processed frames for a specific camera ID."""
    if camera_id not in CAMERA_SOURCES:
        return "Error: Invalid Camera ID", 404
        
    def generate_frames(cam_id):
        while True:
            time.sleep(0.05)  
            with frame_locks[cam_id]:
                frame = latest_frames.get(cam_id)
            if frame:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
    
    return Response(generate_frames(camera_id), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route("/video_feed")
def video_feed_legacy():
    """Legacy endpoint - redirects to default camera (ID 0)."""
    return video_feed(0)

@app.route("/update_search_status", methods=['POST'])
def update_search_status():
    data = request.json
    person_id = data.get('mongo_id')
    action = data.get('action')

    if person_id and action:
        if action == "accept":
            with db_lock:
                initial_count = len(db_faces)
                permanently_found_ids.add(person_id)
                
                final_count = len(db_faces)
            
            if person_id in pending_matches:
                pending_matches.remove(person_id)

            print(f"Action 'accept' for {person_id}. Removed {initial_count - final_count} embeddings from live search.")

        elif action == "research":
            if person_id in pending_matches:
                pending_matches.remove(person_id)
            print(f"Action 'research' for {person_id}. Re-enabling search for this instance.")
            
        return jsonify({"status": "ok"}), 200
        
    return jsonify({"status": "error", "message": "Invalid data"}), 400

@app.route("/camera_status")
def camera_status():
    """Returns the status of all configured cameras."""
    status = {}
    for cam_id in CAMERA_SOURCES:
        camera_name = "Default Webcam" if cam_id == 0 else "External Webcam"
        has_frame = cam_id in latest_frames
        status[cam_id] = {
            "name": camera_name,
            "active": has_frame,
            "stream_url": f"/video_feed/{cam_id}"
        }
    return jsonify(status)

if __name__ == '__main__':
    load_initial_faces()
    
    
    watcher_thread = threading.Thread(target=watch_for_new_people, daemon=True)
    watcher_thread.start()
    
    
    for cam_id in CAMERA_SOURCES:
        camera_name = "Default Webcam" if cam_id == 0 else "External Webcam"
        thread = threading.Thread(target=process_camera_stream, args=(cam_id,), daemon=True)
        thread.start()
        print(f"Started processing thread for {camera_name} (ID: {cam_id})")
    
    
    time.sleep(2)
    
    print("Starting Flask server...")
    app.run(host='0.0.0.0', port=5001, debug=False)