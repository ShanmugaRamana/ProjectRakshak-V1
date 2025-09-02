document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const pythonServiceUrl = 'http://localhost:5001';
    const templeCoords = [23.1828, 75.7679];
    
    // --- MAP INITIALIZATION ---
    const map = L.map('map').setView(templeCoords, 17);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Add main temple marker
    L.marker(templeCoords).addTo(map)
        .bindPopup('<b>Mahakaleshwar Jyotirlinga</b><br>Main Temple')
        .openPopup();

    // --- LIVE FEED ELEMENTS ---
    const liveFeedImg = document.getElementById('live-feed');
    const liveFeedTitle = document.querySelector('.video-feed-container h3');
    
    // --- PREDEFINED CAMERA POSITIONS ---
    const cameraPositions = {
        0: { lat: 23.1835, lng: 75.7668, name: 'Default Webcam' },
        1: { lat: 23.1827, lng: 75.7695, name: 'External Webcam' }
    };

    // --- DYNAMIC CAMERA MARKERS FROM PYTHON SERVICE ---
    fetch(`${pythonServiceUrl}/camera_status`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(cameras => {
            console.log("Available cameras:", cameras);
            let isFirstActiveCamera = true;
            
            for (const cam_id in cameras) {
                const camera = cameras[cam_id];
                
                if (camera.active) {
                    // Use predefined position or fall back to temple coordinates
                    const position = cameraPositions[cam_id] || 
                                   { lat: templeCoords[0], lng: templeCoords[1] };
                    
                    // Create camera marker with icon
                    const cameraIcon = L.AwesomeMarkers.icon({
                        icon: 'video',
                        prefix: 'fa',  // Using 'fa' instead of 'fas' for better compatibility
                        markerColor: 'purple'
                    });
                    
                    const marker = L.marker([position.lat, position.lng], { icon: cameraIcon })
                        .addTo(map)
                        .bindPopup(`<b>${camera.name}</b><br>Click to switch feed`);
                    
                    // Add click handler to switch video feed
                    marker.on('click', () => {
                        console.log(`Switching video feed to ${camera.name} (ID: ${cam_id})`);
                        liveFeedImg.src = `${pythonServiceUrl}${camera.stream_url}`;
                        liveFeedTitle.textContent = `Live Feed: ${camera.name}`;
                        
                        // Highlight the active camera marker
                        marker.openPopup();
                    });
                    
                    // Set first active camera as default feed
                    if (isFirstActiveCamera) {
                        liveFeedImg.src = `${pythonServiceUrl}${camera.stream_url}`;
                        liveFeedTitle.textContent = `Live Feed: ${camera.name}`;
                        isFirstActiveCamera = false;
                        console.log(`Default feed set to: ${camera.name}`);
                    }
                } else {
                    console.warn(`Camera ${cam_id} (${camera.name}) is not active`);
                }
            }
            
            // If no cameras are active
            if (isFirstActiveCamera) {
                liveFeedTitle.textContent = 'No active cameras found';
                console.warn('No active cameras detected');
            }
        })
        .catch(error => {
            console.error("Error fetching camera status:", error);
            liveFeedTitle.textContent = 'Error: Video service unavailable';
            
            // Fallback: Add static camera markers if service is down
            const fallbackPoints = [
                { lat: 23.1835, lng: 75.7668, name: 'Camera C1' },
                { lat: 23.1827, lng: 75.7695, name: 'Camera C2' }
            ];
            
            fallbackPoints.forEach(point => {
                try {
                    const fallbackIcon = L.AwesomeMarkers.icon({
                        icon: 'video',
                        prefix: 'fa',
                        markerColor: 'red'  // Red to indicate offline
                    });

                    L.marker([point.lat, point.lng], { icon: fallbackIcon })
                        .addTo(map)
                        .bindPopup(`<b>${point.name}</b><br><span style="color: red;">Offline</span>`);
                } catch (iconError) {
                    console.warn("Could not create AwesomeMarkers icon, using default:", iconError);
                    // Use default marker if AwesomeMarkers fails
                    L.marker([point.lat, point.lng])
                        .addTo(map)
                        .bindPopup(`<b>${point.name}</b><br><span style="color: red;">Offline</span>`);
                }
            });
        });

    // --- SOCKET.IO NOTIFICATION SYSTEM ---
    const socket = io();
    const notificationBell = document.getElementById('notification-bell');
    const notificationCountSpan = document.getElementById('notification-count');
    let notificationCount = 0;

    // Handle new match notifications
    socket.on('new_match_found', (data) => {
        notificationCount++;
        notificationCountSpan.textContent = notificationCount;
        notificationCountSpan.style.display = 'block';
        notificationBell.classList.add('blinking');
        
        console.log('New match notification received:', data);
        
        // Optional: Show browser notification if permission granted
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Rakshak Alert', {
                body: `Match found: ${data.name || 'Unknown person'}`,
                icon: '/favicon.ico'
            });
        }
    });

    // Handle notification bell click
    notificationBell.addEventListener('click', () => {
        window.open('/notifications', '_blank');
        notificationCount = 0;
        notificationCountSpan.style.display = 'none';
        notificationBell.classList.remove('blinking');
    });

    // --- REQUEST NOTIFICATION PERMISSION ---
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            console.log('Notification permission:', permission);
        });
    }

    // --- ERROR HANDLING FOR LIVE FEED ---
    if (liveFeedImg) {
        liveFeedImg.onerror = () => {
            console.error('Live feed image failed to load');
            liveFeedTitle.textContent = 'Live Feed: Connection Error';
        };

        liveFeedImg.onload = () => {
            console.log('Live feed loaded successfully');
        };
    }

    // --- PERIODIC CAMERA STATUS CHECK ---
    setInterval(() => {
        fetch(`${pythonServiceUrl}/camera_status`)
            .then(response => response.json())
            .then(cameras => {
                // Check if current feed is still active
                const currentSrc = liveFeedImg.src;
                let currentFeedActive = false;
                
                for (const cam_id in cameras) {
                    if (cameras[cam_id].active && 
                        currentSrc.includes(cameras[cam_id].stream_url)) {
                        currentFeedActive = true;
                        break;
                    }
                }
                
                if (!currentFeedActive && liveFeedTitle.textContent !== 'Error: Video service unavailable') {
                    console.warn('Current video feed became inactive');
                    liveFeedTitle.textContent = 'Live Feed: Connection Lost';
                }
            })
            .catch(error => {
                console.error('Camera status check failed:', error);
            });
    }, 30000); // Check every 30 seconds

    console.log('Dashboard initialized successfully');
});