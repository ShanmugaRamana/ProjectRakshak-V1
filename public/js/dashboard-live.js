document.addEventListener('DOMContentLoaded', () => {
    
    // --- MAP INITIALIZATION ---
    const templeCoords = [23.1828, 75.7677]; 
    const map = L.map('map').setView(templeCoords, 17);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    L.marker(templeCoords).addTo(map)
        .bindPopup('<b>Mahakaleshwar Jyotirlinga</b><br>Main Temple')
        .openPopup();

    const pointsOfInterest = [
        { lat: 23.1835, lng: 75.7668, type: 'camera', name: 'Camera C1', icon: 'video', color: 'purple' },
        { lat: 23.1827, lng: 75.7695, type: 'camera', name: 'Camera C2', icon: 'video', color: 'purple' },
    ];

    pointsOfInterest.forEach(point => {
        // Method 1: Try with fa prefix instead of fas
        const customIcon = L.AwesomeMarkers.icon({
            icon: point.icon,
            prefix: 'fa', // Changed from 'fas' to 'fa'
            markerColor: point.color === 'darkpurple' ? 'purple' : point.color // Changed darkpurple to purple
        });

        L.marker([point.lat, point.lng], { icon: customIcon })
            .addTo(map)
            .bindPopup(`<b>${point.name}</b>`);
    });

    // --- Alternative Method: Create custom colored markers without icons ---
    // Uncomment this section if the above doesn't work
    /*
    pointsOfInterest.forEach(point => {
        const colorMap = {
            'green': '#28a745',
            'red': '#dc3545', 
            'blue': '#007bff',
            'orange': '#fd7e14',
            'purple': '#6f42c1'
        };
        
        const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${colorMap[point.color]}; width: 25px; height: 25px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px;"><i class="fas fa-${point.icon}"></i></div>`,
            iconSize: [25, 25],
            iconAnchor: [12, 12]
        });

        L.marker([point.lat, point.lng], { icon: customIcon })
            .addTo(map)
            .bindPopup(`<b>${point.name}</b>`);
    });
    */

    // --- Existing Socket.IO code for notifications ---
    const socket = io();
    const notificationBell = document.getElementById('notification-bell');
    const notificationCountSpan = document.getElementById('notification-count');
    let notificationCount = 0;

    socket.on('new_match_found', (data) => {
        notificationCount++;
        notificationCountSpan.textContent = notificationCount;
        notificationCountSpan.style.display = 'block';
        notificationBell.classList.add('blinking');
    });

    notificationBell.addEventListener('click', () => {
        window.open('/notifications', '_blank');
        notificationCount = 0;
        notificationCountSpan.style.display = 'none';
        notificationBell.classList.remove('blinking');
    });
});