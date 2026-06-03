// In-memory storage (for Vercel compatibility)
let leads = [];
let phoneNumbers = [];
let campaigns = [];

module.exports = {
    getLeads: () => leads,
    saveLeads: (newLeads) => { leads = newLeads; },
    getPhoneNumbers: () => phoneNumbers,
    savePhoneNumbers: (newNumbers) => { phoneNumbers = newNumbers; },
    getCampaigns: () => campaigns,
    saveCampaigns: (newCampaigns) => { campaigns = newCampaigns; }
};
