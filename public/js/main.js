document.addEventListener('DOMContentLoaded', () => {
    const personItems = document.querySelectorAll('.person-item');
    const detailsView = document.getElementById('details-view');

    personItems.forEach(item => {
        item.addEventListener('click', () => {
            personItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const personId = item.dataset.id;
            fetchPersonDetails(personId);
        });
    });

    async function fetchPersonDetails(id) {
        try {
            detailsView.innerHTML = '<p class="details-placeholder">Loading...</p>';
            const response = await fetch(`/api/person/${id}`);
            if (!response.ok) {
                throw new Error('Failed to fetch details.');
            }
            const person = await response.json();
            renderPersonDetails(person);
        } catch (error) {
            console.error('Error fetching details:', error);
            detailsView.innerHTML = `<p class="error-message">Could not load details. Please try again.</p>`;
        }
    }

    function renderPersonDetails(person) {
        const imagesHtml = person.imageList.map(imgSrc => `<img src="${imgSrc}" alt="Photo of ${person.fullName}">`).join('');

        const detailsHtml = `
            <div class="details-content">
                <h2>${person.fullName} <span class="details-status status-${person.status.toLowerCase()}">${person.status}</span></h2>
                
                <section class="details-section">
                    <h4>Lost Person Details</h4>
                    <div class="details-grid">
                        <div class="detail-item"><strong>Age</strong><span>${person.age}</span></div>
                        <div class="detail-item">
                            <strong>Contact Number</strong>
                            <span>${person.personContactNumber || 'N/A (Minor)'}</span>
                        </div>
                        <div class="detail-item full-width">
                            <strong>Last Seen Location</strong>
                            <span>${person.lastSeenLocation}</span>
                        </div>
                        <div class="detail-item full-width">
                            <strong>Last Seen Time</strong>
                            <span>${person.lastSeenTimeFormatted}</span>
                        </div>
                    </div>
                    <h5>Identification Details</h5>
                    <p>${person.identificationDetails}</p>
                </section>
                
                ${person.isMinor ? `
                <section class="details-section">
                    <h4>Guardian Information</h4>
                    <div class="details-grid">
                        <div class="detail-item"><strong>Guardian Type</strong><span>${person.guardianType}</span></div>
                        <div class="detail-item"><strong>Guardian Details</strong><span>${person.guardianDetails}</span></div>
                    </div>
                </section>
                ` : ''}

                <section class="details-section">
                    <h4>Reporter Details</h4>
                    <div class="details-grid">
                        <div class="detail-item"><strong>Name</strong><span>${person.reporterName}</span></div>
                        <div class="detail-item"><strong>Relation</strong><span>${person.reporterRelation}</span></div>
                        <div class="detail-item full-width"><strong>Contact Number</strong><span>${person.reporterContactNumber}</span></div>
                    </div>
                     <p><em>Report filed on: ${person.createdAtFormatted}</em></p>
                </section>

                <section class="details-section">
                    <h4>Reported Images</h4>
                    <div class="details-images">${imagesHtml}</div>
                </section>
            </div>
        `;

        detailsView.innerHTML = detailsHtml;
    }
});