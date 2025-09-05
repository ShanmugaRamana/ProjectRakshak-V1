import os
import cv2
import numpy as np
import threading
import requests
import base64
import time
from flask import Flask, Response, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from ultralytics import YOLO
from insightface.app import FaceAnalysis
from scipy.spatial.distance import cosine
from dotenv import load_dotenv

load_dotenv()

# ---------------------- CONFIGURATION ----------------------
MONGO_URI = os.getenv("MONGO_URI")
NODE_API_URL = "http://localhost:3000/api/report_match"
CAMERA_SOURCES = [0, 1]  # List of camera indices (e.g., built-in and external webcam)
SIMILARITY_THRESHOLD = 0.5
DETECTION_INTERVAL = 5
VERIFICATION_THRESHOLD = 0.6
DUPLICATE_THRESHOLD = 0.7

# ---------------------- INITIALIZATION ----------------------
app = Flask(__name__)
CORS(app)

# --- Database & AI Models ---
try:
    client = MongoClient(MONGO_URI)
    db = client['rakshak']
    people_collection = db['people']
    print("MongoDB connected successfully.")
except Exception as e:
    print(f"Error connecting to MongoDB: {e}")
    exit()

print("Initializing AI models...")
yolo_model = YOLO('yolo11n.pt')
face_app = FaceAnalysis(name="buffalo_l", providers=['CPUExecutionProvider'])
face_app.prepare(ctx_id=0)
print("AI models initialized.")

# --- Global State Management ---
db_faces = []
pending_matches = set()
permanently_found_ids = set() # Stores IDs of people marked 'Found' to prevent re-notification
db_lock = threading.Lock()
latest_frames = {}
frame_locks = {cam_id: threading.Lock() for cam_id in CAMERA_SOURCES}

# ---------------------- CORE FUNCTIONS ----------------------

def process_person_doc(doc):
    """Processes a document from MongoDB to extract face embeddings."""
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
    """Loads all 'Lost' people from DB into the in-memory list at startup."""
    print("Loading initial set of 'Lost' faces from database...")
    with db_lock:
        db_faces.clear()
        permanently_found_ids.clear()
        for doc in people_collection.find({"status": "Lost"}):
            processed_faces = process_person_doc(doc)
            if processed_faces:
                db_faces.extend(processed_faces)
    print(f"--- Initial load complete. Total embeddings in active search: {len(db_faces)} ---")

def watch_for_new_people():
    """Watches MongoDB for new people and adds them to the live search list."""
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
                    print(f"[Watcher] Added {len(processed_faces)} new face(s) to live search.")

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
            print(f"Camera {camera_id}: Lost connection. Retrying..."); time.sleep(2); cap.release(); cap = cv2.VideoCapture(camera_id); continue
        
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
                            if db_face['mongo_id'] in permanently_found_ids or db_face['mongo_id'] in pending_matches:
                                continue
                            similarity = 1 - cosine(live_embedding, db_face['embedding'])
                            if similarity > SIMILARITY_THRESHOLD and similarity > best_similarity:
                                best_similarity, best_match_name, best_match_id = similarity, db_face['name'], db_face['mongo_id']
                        
                        if best_match_id:
                            try:
                                print(f"Match found on Camera {camera_id}: {best_match_name}")
                                # --- OPTIMIZATION: Resize snapshot to a small thumbnail ---
                                thumbnail = cv2.resize(face_crop, (200, 200), interpolation=cv2.INTER_AREA)
                                _, buffer = cv2.imencode('.jpg', thumbnail)
                                snapshot_b64 = base64.b64encode(buffer).decode('utf-8')
                                
                                payload = {
                                    "mongo_id": best_match_id, "name": best_match_name,
                                    "snapshot": snapshot_b64, "camera_name": f"Camera C{camera_id + 1}"
                                }
                                pending_matches.add(best_match_id)
                                requests.post(NODE_API_URL, json=payload, timeout=3)
                            except Exception as e:
                                print(f"!! WARNING: Could not process/report snapshot for {best_match_name}. Error: {e}")
                                if best_match_id in pending_matches:
                                    pending_matches.remove(best_match_id)
                        
                        color = (0, 255, 0) if best_match_id else (0, 0, 255)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(frame, best_match_name, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        
        # Store the latest processed frame
        with frame_locks[camera_id]:
            _, buffer = cv2.imencode('.jpg', frame)
            latest_frames[camera_id] = buffer.tobytes()

# ---------------------- FLASK WEB SERVER ----------------------

# --- REMOVED: The old /detect endpoint is no longer needed. ---

@app.route('/verify_faceset', methods=['POST'])
def verify_faceset():
    """Handles verification for a set of uploaded images."""
    files = request.files.getlist('images')
    if not (3 <= len(files) <= 7):
        return jsonify({"success": False, "message": f"Invalid number of images. Expected 3-7, got {len(files)}."})
    embeddings = []
    for idx, file in enumerate(files):
        try:
            npimg = np.frombuffer(file.read(), np.uint8)
            image = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
            detected_faces = face_app.get(image)
            if len(detected_faces) == 0: return jsonify({"success": False, "message": f"No face detected in image {idx + 1} ({file.filename})."})
            if len(detected_faces) > 1: return jsonify({"success": False, "message": f"More than one face detected in image {idx + 1} ({file.filename})."})
            embeddings.append(detected_faces[0].embedding.astype('float32'))
        except Exception as e:
            return jsonify({"success": False, "message": f"Error processing image {idx + 1}: {str(e)}"})
    
    reference_embedding = embeddings[0]
    for i in range(1, len(embeddings)):
        similarity = 1 - cosine(reference_embedding, embeddings[i])
        if similarity < VERIFICATION_THRESHOLD:
            return jsonify({"success": False, "message": f"The face in image {i + 1} does not appear to be the same person as in the first image."})
    
    with db_lock:
        for db_face in db_faces:
            similarity = 1 - cosine(reference_embedding, db_face['embedding'])
            if similarity > DUPLICATE_THRESHOLD:
                return jsonify({"success": False, "message": f"This person appears to be a duplicate of '{db_face['name']}' who is already in the system."})
    
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

@app.route("/update_search_status", methods=['POST'])
def update_search_status():
    data = request.json
    person_id, action = data.get('mongo_id'), data.get('action')
    if person_id and action:
        if action == "accept":
            with db_lock:
                permanently_found_ids.add(person_id) # Add to permanent ignore list for this session
                db_faces[:] = [face for face in db_faces if face.get('mongo_id') != person_id]
            if person_id in pending_matches: pending_matches.remove(person_id)
            print(f"Action 'accept' for {person_id}. Permanently removed from live search.")
        elif action == "research":
            if person_id in pending_matches: pending_matches.remove(person_id)
            print(f"Action 'research' for {person_id}. Re-enabling search for this instance.")
        return jsonify({"status": "ok"}), 200
    return jsonify({"status": "error", "message": "Invalid data"}), 400

@app.route("/camera_status")
def camera_status():
    """Returns the status of all configured cameras."""
    status = {}
    for cam_id in CAMERA_SOURCES:
        camera_name = f"Camera C{cam_id + 1}"
        has_frame = cam_id in latest_frames
        status[cam_id] = {
            "name": camera_name, "active": has_frame, "stream_url": f"/video_feed/{cam_id}"
        }
    return jsonify(status)

# ---------------------- MAIN EXECUTION ----------------------
if __name__ == '__main__':
    load_initial_faces()
    watcher_thread = threading.Thread(target=watch_for_new_people, daemon=True)
    watcher_thread.start()
    for cam_id in CAMERA_SOURCES:
        thread = threading.Thread(target=process_camera_stream, args=(cam_id,), daemon=True)
        thread.start()
        print(f"Started processing thread for Camera {cam_id}")
    print("Starting Flask server...")
    app.run(host='0.0.0.0', port=5001, debug=False)