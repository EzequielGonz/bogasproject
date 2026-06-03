const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const Papa = require('papaparse');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const storage = require('./storage');
const session = require('express-session');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use(session({
  secret: 'abogado-secret-key-123',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

const VALID_USER = 'ABOGADO123';
const VALID_PASS = 'ABOGADO123';

function checkAuth(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === VALID_USER && password === VALID_PASS) {
    req.session.user = username;
    res.json({ success: true, user: username });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/check-auth', (req, res) => {
  if (req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

app.use(express.static('public'));

app.get('/', (req, res) => {
  if (req.session.user) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: uploadStorage });

app.post('/api/upload', checkAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    let data = [];

    if (req.file.mimetype === 'text/csv' || req.file.originalname.endsWith('.csv')) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const result = Papa.parse(fileContent, { header: true });
      data = result.data;
    } else if (req.file.originalname.match(/\.(xlsx|xls)$/)) {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      data = XLSX.utils.sheet_to_json(worksheet);
    } else {
      return res.status(400).json({ error: 'Unsupported file format' });
    }

    fs.unlinkSync(filePath);

    const leads = data.map(item => ({
      id: Date.now() + Math.random(),
      ...item,
      status: 'new',
      createdAt: new Date().toISOString(),
      messages: []
    }));

    const existingLeads = storage.getLeads();
    storage.saveLeads([...existingLeads, ...leads]);

    res.json({ success: true, data: leads });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Error processing file' });
  }
});

app.get('/api/leads', checkAuth, (req, res) => {
  res.json(storage.getLeads());
});

app.put('/api/leads/:id', checkAuth, (req, res) => {
  const leads = storage.getLeads();
  const index = leads.findIndex(l => l.id == req.params.id);
  if (index !== -1) {
    leads[index] = { ...leads[index], ...req.body };
    storage.saveLeads(leads);
    res.json(leads[index]);
  } else {
    res.status(404).json({ error: 'Lead not found' });
  }
});

app.get('/api/phone-numbers', checkAuth, (req, res) => {
  res.json(storage.getPhoneNumbers());
});

app.post('/api/phone-numbers', checkAuth, (req, res) => {
  const numbers = storage.getPhoneNumbers();
  const newNumber = {
    id: Date.now(),
    number: req.body.number,
    warmedUp: false,
    messagesToday: 0,
    dateAdded: new Date().toISOString(),
    dailyLimit: 40
  };
  numbers.push(newNumber);
  storage.savePhoneNumbers(numbers);
  res.json(newNumber);
});

app.delete('/api/phone-numbers/:id', checkAuth, (req, res) => {
  const numbers = storage.getPhoneNumbers().filter(n => n.id != req.params.id);
  storage.savePhoneNumbers(numbers);
  res.json({ success: true });
});

const messageQueue = [];
let isProcessing = false;

function getRandomDelay(min = 0, max = 20) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

function personalizeMessage(template, lead) {
  let message = template;
  Object.keys(lead).forEach(key => {
    message = message.replace(new RegExp(`{{${key}}}`, 'g'), lead[key] || '');
  });
  return message;
}

async function processQueue() {
  if (isProcessing || messageQueue.length === 0) return;
  isProcessing = true;

  const job = messageQueue.shift();
  const delay = getRandomDelay(job.minDelay, job.maxDelay);
  
  console.log(`Waiting ${delay/1000}s before sending message to ${job.lead.nombre || job.lead.telefono}`);
  
  await new Promise(resolve => setTimeout(resolve, delay));
  
  console.log(`Sending message to ${job.lead.nombre || job.lead.telefono}:`, job.message);
  
  const leads = storage.getLeads();
  const leadIndex = leads.findIndex(l => l.id === job.lead.id);
  if (leadIndex !== -1) {
    leads[leadIndex].messages.push({
      content: job.message,
      sentAt: new Date().toISOString(),
      direction: 'outgoing'
    });
    leads[leadIndex].status = 'active';
    storage.saveLeads(leads);
  }

  isProcessing = false;
  processQueue();
}

app.post('/api/send-messages', checkAuth, (req, res) => {
  const { leadIds, template, minDelay = 0, maxDelay = 20 } = req.body;
  const leads = storage.getLeads().filter(l => leadIds.includes(l.id));
  
  leads.forEach(lead => {
    const message = personalizeMessage(template || 'Hola {{nombre}}!', lead);
    messageQueue.push({ lead, message, minDelay, maxDelay });
  });

  processQueue();
  res.json({ success: true, queued: leads.length });
});

const cron = require('node-cron');

cron.schedule('0 0 * * *', () => {
  const numbers = storage.getPhoneNumbers();
  numbers.forEach(num => {
    num.messagesToday = 0;
    const daysSinceAdded = Math.floor((new Date() - new Date(num.dateAdded)) / (1000 * 60 * 60 * 24));
    if (daysSinceAdded > 0) {
      num.dailyLimit = Math.min(40 + (daysSinceAdded * 10), 200);
    }
  });
  storage.savePhoneNumbers(numbers);
  console.log('Daily reset completed');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
