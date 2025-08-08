document.addEventListener('DOMContentLoaded', () => {
    const actionButtons = document.querySelectorAll('.notification-actions button');

    actionButtons.forEach(button => {
        button.addEventListener('click', handleAction);
    });

    async function handleAction(event) {
        const button = event.target;
        const personId = button.dataset.id;
        const action = button.classList.contains('btn-accept') ? 'accept' : 'research';
        const card = button.closest('.notification-card');
        const actionsDiv = card.querySelector('.notification-actions');
        
        actionsDiv.innerHTML = `<p style="color: #0056b3;">Processing...</p>`;

        try {
            const response = await fetch(`/api/person/${personId}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: action })
            });

            if (response.ok) {
                if (action === 'accept') {
                    card.style.border = '2px solid #28a745';
                    actionsDiv.innerHTML = `<p style="color: #28a745; font-weight: bold;">Accepted. Status is 'Found'.</p>`;
                } else {
                    card.style.opacity = '0.5';
                    actionsDiv.innerHTML = `<p style="color: #6c757d; font-weight: bold;">Re-Search Initiated.</p>`;
                }
            } else {
                const result = await response.json();
                actionsDiv.innerHTML = `<p style="color: #dc3545;">Error: ${result.message}</p>`;
            }
        } catch (err) {
            console.error(`Error during ${action}:`, err);
            actionsDiv.innerHTML = `<p style="color: #dc3545;">A client-side error occurred.</p>`;
        }
    }
});