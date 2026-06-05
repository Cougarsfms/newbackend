const fs = require('fs');

const content = fs.readFileSync('src/service-provider/service-provider.service.ts', 'utf8');
const lines = content.split('\n');

let startIndex = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('async clockIn(')) {
    startIndex = i;
    break;
  }
}

if (startIndex !== -1) {
  console.log(`Found clockIn at line ${startIndex + 1}:`);
  const end = Math.min(startIndex + 100, lines.length);
  for (let i = startIndex; i < end; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
} else {
  console.log('clockIn method not found.');
}
