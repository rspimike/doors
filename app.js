// State
let projectInfo = {};
let doors = [];
let doorImages = {}; // base64 images keyed by door type

// Pre-load door images as base64 for PDF embedding
// Images are loaded via <img> tags already in the page, converted at runtime
function loadDoorImages() {
    // We convert the visible <img> elements to base64 using a canvas
    // This works because the images are same-origin (local files served together)
    const imageMap = {
        'Left Hand': 'left_hand.png',
        'Left Hand Reverse': 'left_hand_reverse.png',
        'Right Hand': 'right_hand.png',
        'Right Hand Reverse': 'right_hand_reverse.png'
    };

    // Wait for all images in the page to load, then convert them
    window.addEventListener('load', () => {
        const imgs = document.querySelectorAll('.door-card img');
        imgs.forEach(img => {
            const src = img.getAttribute('src');
            // Find which type this image belongs to
            for (const [type, file] of Object.entries(imageMap)) {
                if (src === file) {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        doorImages[type] = canvas.toDataURL('image/png');
                    } catch (e) {
                        // If canvas tainted (file:// protocol), we'll use inline data
                        console.warn('Canvas tainted for', type, '- using inline data fallback');
                    }
                    break;
                }
            }
        });

        // If doorImages is still empty (file:// CORS issue), load from DOOR_IMAGE_DATA
        if (Object.keys(doorImages).length === 0 && typeof DOOR_IMAGE_DATA !== 'undefined') {
            Object.assign(doorImages, DOOR_IMAGE_DATA);
        }
    });

    // Immediate fallback: if DOOR_IMAGE_DATA global exists, use it right away
    if (typeof DOOR_IMAGE_DATA !== 'undefined') {
        Object.assign(doorImages, DOOR_IMAGE_DATA);
    }
}

// Ensure inches symbol is present on dimension values
function ensureInches(value) {
    value = value.trim();
    if (!value) return value;
    // If it already ends with " or ″ leave it alone
    if (value.endsWith('"') || value.endsWith('\u2033')) return value;
    return value + '"';
}

loadDoorImages();

// DOM Elements
const stepProject = document.getElementById('step-project');
const stepDoor = document.getElementById('step-door');
const stepSummary = document.getElementById('step-summary');
const projectForm = document.getElementById('project-form');
const doorForm = document.getElementById('door-form');
const doorCount = document.getElementById('door-count');
const btnFinish = document.getElementById('btn-finish');
const btnDownload = document.getElementById('btn-download');
const btnRestart = document.getElementById('btn-restart');
const btnBackEdit = document.getElementById('btn-back-edit');
const summaryContent = document.getElementById('summary-content');
const savedProjectSelect = document.getElementById('saved-project-select');
const savedContactSelect = document.getElementById('saved-contact-select');

// Navigation
function showStep(step) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    step.classList.add('active');
}

function updateDoorCount() {
    doorCount.textContent = `(Door #${doors.length + 1})`;
}

// --- Saved Projects & Contacts ---

function getSavedProjects() {
    try {
        return JSON.parse(localStorage.getItem('doorapp_projects') || '[]');
    } catch (e) { return []; }
}

function saveProject(project) {
    const projects = getSavedProjects();
    // Update existing or add new (match by name)
    const idx = projects.findIndex(p => p.name === project.name);
    if (idx >= 0) {
        projects[idx] = project;
    } else {
        projects.push(project);
    }
    localStorage.setItem('doorapp_projects', JSON.stringify(projects));
}

function getSavedContacts() {
    try {
        return JSON.parse(localStorage.getItem('doorapp_contacts') || '[]');
    } catch (e) { return []; }
}

function saveContact(contact) {
    const contacts = getSavedContacts();
    const idx = contacts.findIndex(c => c.contactName === contact.contactName);
    if (idx >= 0) {
        contacts[idx] = contact;
    } else {
        contacts.push(contact);
    }
    localStorage.setItem('doorapp_contacts', JSON.stringify(contacts));
}

function populateProjectDropdown() {
    const projects = getSavedProjects();
    savedProjectSelect.innerHTML = '<option value="">— New Project —</option>';
    projects.forEach((p, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = p.name;
        savedProjectSelect.appendChild(opt);
    });
}

function populateContactDropdown() {
    const contacts = getSavedContacts();
    savedContactSelect.innerHTML = '<option value="">— New Contact —</option>';
    contacts.forEach((c, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = c.contactName;
        savedContactSelect.appendChild(opt);
    });
}

savedProjectSelect.addEventListener('change', () => {
    const idx = savedProjectSelect.value;
    if (idx === '') return;
    const projects = getSavedProjects();
    const p = projects[idx];
    if (p) {
        document.getElementById('project-name').value = p.name || '';
        document.getElementById('project-address').value = p.address || '';
        document.getElementById('project-city').value = p.city || '';
        document.getElementById('project-state').value = p.state || '';
        document.getElementById('project-zip').value = p.zip || '';
    }
});

savedContactSelect.addEventListener('change', () => {
    const idx = savedContactSelect.value;
    if (idx === '') return;
    const contacts = getSavedContacts();
    const c = contacts[idx];
    if (c) {
        document.getElementById('contact-name').value = c.contactName || '';
        document.getElementById('contact-phone').value = c.phone || '';
        document.getElementById('contact-email').value = c.email || '';
    }
});

// Populate dropdowns on load
populateProjectDropdown();
populateContactDropdown();

// Step 1: Project Info
projectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    projectInfo = {
        name: document.getElementById('project-name').value.trim(),
        address: document.getElementById('project-address').value.trim(),
        city: document.getElementById('project-city').value.trim(),
        state: document.getElementById('project-state').value.trim(),
        zip: document.getElementById('project-zip').value.trim(),
        contactName: document.getElementById('contact-name').value.trim(),
        phone: document.getElementById('contact-phone').value.trim(),
        email: document.getElementById('contact-email').value.trim()
    };
    saveProject({ name: projectInfo.name, address: projectInfo.address, city: projectInfo.city, state: projectInfo.state, zip: projectInfo.zip });
    saveContact({ contactName: projectInfo.contactName, phone: projectInfo.phone, email: projectInfo.email });
    populateProjectDropdown();
    populateContactDropdown();
    showStep(stepDoor);
    updateDoorCount();
});

// Step 2: Door Selection
let editingDoorIndex = -1; // -1 means adding new, >= 0 means editing existing

function resetDoorForm() {
    doorForm.reset();
    editingDoorIndex = -1;
    // Reset button text
    doorForm.querySelector('button[type="submit"]').textContent = 'Add Another Door';
    updateDoorCount();
    renderDoorList();
}

function renderDoorList() {
    const container = document.getElementById('door-list-container');
    const list = document.getElementById('door-list');

    if (doors.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    list.innerHTML = doors.map((door, i) => `
        <div class="door-list-item">
            <div class="door-info">
                <strong>#${i + 1} ${door.room}</strong>
                <span>${door.type} — ${door.width} × ${door.height}</span>
            </div>
            <div class="door-actions">
                <button type="button" class="btn-edit" onclick="editDoor(${i})">Edit</button>
                <button type="button" class="btn-delete" onclick="deleteDoor(${i})">Del</button>
            </div>
        </div>
    `).join('');
}

function editDoor(index) {
    const door = doors[index];
    editingDoorIndex = index;

    document.getElementById('room-name').value = door.room;
    document.getElementById('rough-opening').value = door.roughOpening;
    document.getElementById('door-width').value = door.width;
    document.getElementById('door-height').value = door.height;

    // Select the right radio
    const radios = document.querySelectorAll('input[name="door-type"]');
    radios.forEach(r => { r.checked = (r.value === door.type); });

    // Change button text
    doorForm.querySelector('button[type="submit"]').textContent = 'Save Changes';
}

function deleteDoor(index) {
    doors.splice(index, 1);
    // Renumber
    doors.forEach((d, i) => { d.number = i + 1; });
    resetDoorForm();
}

function addDoorFromForm() {
    const doorType = document.querySelector('input[name="door-type"]:checked');
    if (!doorType) {
        alert('Please select a door type.');
        return false;
    }

    const roomName = document.getElementById('room-name').value.trim();
    const roughOpening = document.getElementById('rough-opening').value.trim();
    const doorWidth = document.getElementById('door-width').value.trim();
    const doorHeight = document.getElementById('door-height').value.trim();

    if (!roomName || !roughOpening || !doorWidth || !doorHeight) {
        alert('Please fill in all fields.');
        return false;
    }

    const doorData = {
        room: roomName,
        type: doorType.value,
        roughOpening: ensureInches(roughOpening),
        width: ensureInches(doorWidth),
        height: ensureInches(doorHeight)
    };

    if (editingDoorIndex >= 0) {
        // Update existing
        doorData.number = editingDoorIndex + 1;
        doors[editingDoorIndex] = doorData;
    } else {
        // Add new
        doorData.number = doors.length + 1;
        doors.push(doorData);
    }

    return true;
}

doorForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (addDoorFromForm()) {
        resetDoorForm();
    }
});

btnFinish.addEventListener('click', () => {
    // Validate current form has data
    const roomName = document.getElementById('room-name').value.trim();
    const doorType = document.querySelector('input[name="door-type"]:checked');

    if (roomName || doorType) {
        // User has started filling in a door, try to add/update it
        if (!addDoorFromForm()) {
            return; // Validation failed
        }
        resetDoorForm();
    }

    if (doors.length === 0) {
        alert('Please add at least one door before finishing.');
        return;
    }

    showSummary();
    showStep(stepSummary);
});

// Step 3: Summary
function showSummary() {
    const fullAddress = `${projectInfo.address}, ${projectInfo.city}, ${projectInfo.state} ${projectInfo.zip}`;

    let html = `
        <div class="project-info">
            <p><strong>Project:</strong> ${projectInfo.name}</p>
            <p><strong>Address:</strong> ${fullAddress}</p>
            <p><strong>Contact:</strong> ${projectInfo.contactName}</p>
            <p><strong>Phone:</strong> ${projectInfo.phone}</p>
            <p><strong>Email:</strong> ${projectInfo.email}</p>
        </div>
        <table class="summary-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Room</th>
                    <th>Door Handing</th>
                    <th>Rough Opening</th>
                    <th>Door Width</th>
                    <th>Door Height</th>
                </tr>
            </thead>
            <tbody>
    `;

    doors.forEach(door => {
        html += `
            <tr>
                <td>${door.number}</td>
                <td>${door.room}</td>
                <td>${door.type}</td>
                <td>${door.roughOpening}</td>
                <td>${door.width}</td>
                <td>${door.height}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    summaryContent.innerHTML = html;
}

// PDF Generation
btnDownload.addEventListener('click', generatePDF);

function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Using Times for a more refined, professional look
    // (jsPDF built-in options: helvetica, times, courier)
    const fontFamily = 'times';

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let y = 14;

    // Company Logo (top-right corner)
    if (typeof COMPANY_LOGO !== 'undefined') {
        try {
            doc.addImage(COMPANY_LOGO, 'PNG', pageWidth - margin - 40, y - 4, 40, 20);
        } catch (e) {
            // Skip logo if there's an issue
        }
    }

    // Title
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(22);
    doc.text('DOOR SCHEDULE', margin, y + 8);
    y += 20;

    // Divider line
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Project Info (no section header — cleaner)
    doc.setFontSize(9.5);
    doc.setFont(fontFamily, 'normal');

    const fullAddress = `${projectInfo.address}, ${projectInfo.city}, ${projectInfo.state} ${projectInfo.zip}`;
    const infoLines = [
        `Project: ${projectInfo.name}`,
        `Address: ${fullAddress}`,
        `Contact: ${projectInfo.contactName}  |  Phone: ${projectInfo.phone}  |  Email: ${projectInfo.email}`,
        `Date: ${new Date().toLocaleDateString()}  |  Total Doors: ${doors.length}`
    ];

    infoLines.forEach(line => {
        doc.text(line, margin, y);
        y += 5.5;
    });

    y += 8;

    // Door Schedule header
    doc.setFontSize(12);
    doc.setFont(fontFamily, 'bold');
    doc.text('Door Schedule', margin, y);
    y += 8;

    doors.forEach((door) => {
        // Each entry needs ~38mm of space
        if (y + 38 > pageHeight - 20) {
            doc.addPage();
            y = 20;
        }

        // Door entry header
        doc.setFontSize(10);
        doc.setFont(fontFamily, 'bold');
        doc.text(`#${door.number}  ${door.room}`, margin, y);
        y += 5;

        // Draw a light background box for this entry
        doc.setFillColor(246, 248, 251);
        doc.roundedRect(margin, y - 2, pageWidth - margin * 2, 30, 2, 2, 'F');

        // Door image on the left
        const imgSize = 26;
        const imgX = margin + 3;
        const imgY = y;
        if (doorImages[door.type]) {
            doc.addImage(doorImages[door.type], 'PNG', imgX, imgY, imgSize, imgSize);
        }

        // Door details to the right of image — compressed layout
        const textX = margin + imgSize + 10;
        let textY = y + 8;

        // Line 1: Handing — Width x Height
        doc.setFontSize(9.5);
        doc.setFont(fontFamily, 'bold');
        doc.text(`${door.type}`, textX, textY);
        doc.setFont(fontFamily, 'normal');
        const handingWidth = doc.getTextWidth(door.type);
        doc.text(`  —  ${door.width} W  \u00D7  ${door.height} H`, textX + handingWidth, textY);
        textY += 7;

        // Line 2: Rough opening in italics with brackets
        doc.setFont(fontFamily, 'italic');
        doc.text(`[R.O. ${door.roughOpening}]`, textX, textY);

        y += 34;
    });

    // Save
    const fileName = `Door_Schedule_${projectInfo.name.replace(/\s+/g, '_')}.pdf`;
    doc.save(fileName);
}

// Back to edit doors
btnBackEdit.addEventListener('click', () => {
    showStep(stepDoor);
    renderDoorList();
    updateDoorCount();
});

// Restart
btnRestart.addEventListener('click', () => {
    projectInfo = {};
    doors = [];
    projectForm.reset();
    doorForm.reset();
    showStep(stepProject);
});
