let uploadedData = [];
let phoneNumbers = [];
let leads = [];
let selectedLeads = [];

async function init() {
    const authResponse = await fetch('/api/check-auth');
    const authData = await authResponse.json();
    if (!authData.authenticated) {
        window.location.href = '/';
        return;
    }
    await loadLeads();
    await loadPhoneNumbers();
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
}

function showTab(tabName) {
    document.querySelectorAll('.content-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.remove('tab-active'));
    
    document.getElementById(`content-${tabName}`).classList.remove('hidden');
    document.getElementById(`tab-${tabName}`).classList.add('tab-active');
}

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (result.success) {
            uploadedData = result.data;
            await loadLeads();
            displayPreview();
        } else {
            alert('Error al cargar el archivo');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al procesar el archivo');
    }
}

function displayPreview() {
    const preview = document.getElementById('preview');
    const headers = document.getElementById('tableHeaders');
    const body = document.getElementById('tableBody');

    preview.classList.remove('hidden');
    
    if (uploadedData.length === 0) return;

    const keys = Object.keys(uploadedData[0]);
    headers.innerHTML = keys.map(key => 
        `<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${key}</th>`
    ).join('');

    body.innerHTML = uploadedData.slice(0, 10).map(row => 
        `<tr>${keys.map(key => `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${row[key] || ''}</td>`).join('')}</tr>`
    ).join('');
    
    if (uploadedData.length > 10) {
        body.innerHTML += `<tr><td colspan="${keys.length}" class="px-6 py-4 text-center text-gray-500">... y ${uploadedData.length - 10} registros más</td></tr>`;
    }
}

async function startCampaign() {
    const template = document.getElementById('messageTemplate').value || 'Hola {{nombre}}!';
    const minDelay = parseInt(document.getElementById('minDelay').value) || 0;
    const maxDelay = parseInt(document.getElementById('maxDelay').value) || 20;
    
    if (leads.length === 0) {
        alert('Primero carga un archivo');
        return;
    }
    
    const leadIds = selectedLeads.length > 0 ? selectedLeads : leads.map(l => l.id);
    
    try {
        const response = await fetch('/api/send-messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leadIds, template, minDelay, maxDelay })
        });
        
        const result = await response.json();
        if (result.success) {
            alert(`Campaña iniciada! ${result.queued} mensajes en cola`);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function loadLeads() {
    try {
        const response = await fetch('/api/leads');
        leads = await response.json();
        updateLeadsStats();
    } catch (error) {
        console.error('Error loading leads:', error);
    }
}

function updateLeadsStats() {
    document.getElementById('totalLeads').textContent = leads.length;
    document.getElementById('activeLeads').textContent = leads.filter(l => l.status === 'active').length;
    document.getElementById('droppedLeads').textContent = leads.filter(l => l.status === 'dropped').length;
    renderLeadsList();
}

function toggleLeadSelection(id) {
    if (selectedLeads.includes(id)) {
        selectedLeads = selectedLeads.filter(l => l !== id);
    } else {
        selectedLeads.push(id);
    }
    renderLeadsList();
}

function renderLeadsList() {
    const list = document.getElementById('leadsList');
    if (leads.length === 0) {
        list.innerHTML = '<p class="text-gray-500">No hay leads todavía</p>';
        return;
    }
    
    list.innerHTML = leads.map((lead) => {
        const isSelected = selectedLeads.includes(lead.id);
        return `
        <div class="border rounded-lg p-4 mb-4 ${isSelected ? 'bg-blue-50 border-blue-300' : ''}">
            <div class="flex justify-between items-start">
                <div class="flex items-start space-x-3">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} 
                           onchange="toggleLeadSelection(${lead.id})" 
                           class="mt-1">
                    <div>
                        <h4 class="font-semibold">${lead.nombre || lead.Nombre || 'N/A'} ${lead.apellido || lead.Apellido || ''}</h4>
                        <p class="text-sm text-gray-600">Teléfono: ${lead.telefono || lead.Telefono || 'N/A'}</p>
                        <p class="text-sm text-gray-600">Lesión: ${lead.lesion || lead.Lesion || 'N/A'}</p>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="px-2 py-1 rounded text-xs ${
                        lead.status === 'dropped' ? 'bg-red-100 text-red-800' : 
                        lead.status === 'active' ? 'bg-green-100 text-green-800' : 
                        'bg-yellow-100 text-yellow-800'
                    }">
                        ${lead.status || 'nuevo'}
                    </span>
                    <button onclick="updateLeadStatus(${lead.id}, 'dropped')" class="text-red-600 hover:text-red-800 text-sm">Marcar como caído</button>
                </div>
            </div>
        </div>
    `}).join('');
}

async function updateLeadStatus(id, status) {
    try {
        await fetch(`/api/leads/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        await loadLeads();
    } catch (error) {
        console.error('Error updating lead:', error);
    }
}

async function loadPhoneNumbers() {
    try {
        const response = await fetch('/api/phone-numbers');
        phoneNumbers = await response.json();
        renderPhoneNumbers();
    } catch (error) {
        console.error('Error loading numbers:', error);
    }
}

async function addPhoneNumber() {
    const input = document.getElementById('newNumber');
    const number = input.value.trim();
    
    if (number) {
        try {
            const response = await fetch('/api/phone-numbers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ number })
            });
            await loadPhoneNumbers();
            input.value = '';
        } catch (error) {
            console.error('Error adding number:', error);
        }
    }
}

function renderPhoneNumbers() {
    const list = document.getElementById('numbersList');
    if (phoneNumbers.length === 0) {
        list.innerHTML = '<p class="text-gray-500">No hay números agregados</p>';
        return;
    }
    
    list.innerHTML = phoneNumbers.map((num) => `
        <div class="border rounded-lg p-4 mb-4 flex justify-between items-center">
            <div>
                <h4 class="font-semibold">${num.number}</h4>
                <p class="text-sm text-gray-600">Estado: ${num.warmedUp ? 'Calentado' : 'En calentamiento'}</p>
                <p class="text-sm text-gray-600">Mensajes hoy: ${num.messagesToday} / ${num.dailyLimit}</p>
            </div>
            <button onclick="removePhoneNumber(${num.id})" class="text-red-600 hover:text-red-800">Eliminar</button>
        </div>
    `).join('');
}

async function removePhoneNumber(id) {
    try {
        await fetch(`/api/phone-numbers/${id}`, { method: 'DELETE' });
        await loadPhoneNumbers();
    } catch (error) {
        console.error('Error removing number:', error);
    }
}

init();
