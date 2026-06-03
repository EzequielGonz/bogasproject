const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

const STORAGE_FILES = {
    leads: path.join(DATA_DIR, 'leads.json'),
    phoneNumbers: path.join(DATA_DIR, 'phoneNumbers.json'),
    campaigns: path.join(DATA_DIR, 'campaigns.json')
};

function readStorage(file) {
    if (!fs.existsSync(file)) {
        return [];
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return [];
    }
}

function writeStorage(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

module.exports = {
    getLeads: () => readStorage(STORAGE_FILES.leads),
    saveLeads: (leads) => writeStorage(STORAGE_FILES.leads, leads),
    getPhoneNumbers: () => readStorage(STORAGE_FILES.phoneNumbers),
    savePhoneNumbers: (numbers) => writeStorage(STORAGE_FILES.phoneNumbers, numbers),
    getCampaigns: () => readStorage(STORAGE_FILES.campaigns),
    saveCampaigns: (campaigns) => writeStorage(STORAGE_FILES.campaigns, campaigns)
};
