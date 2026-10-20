const bcrypt = require('bcryptjs');
const hash = '$2b$10$KIXHk5lU3G9wYbvZ8nNdOeVJ6Y2PsQmT4cRxWfD7BjA1gCuEhMp0K';
const password = 'MwalimuDemo2025';
console.log('Match:', bcrypt.compareSync(password, hash));
