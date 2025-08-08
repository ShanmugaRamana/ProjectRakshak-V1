document.addEventListener('DOMContentLoaded', () => {
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