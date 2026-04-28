const fs = require('fs');
const path = 'prisma/schema.prisma';
let content = fs.readFileSync(path, 'utf8');

// Replace 'id String @id @db.Uuid' (with any whitespace) to include the default
// Also handle cases where there might be extra spaces
const regex = /id\s+String\s+@id\s+@db\.Uuid/g;
const replacement = 'id String @id @default(dbgenerated(\"gen_random_uuid()\")) @db.Uuid';

const newContent = content.replace(regex, replacement);

if (content !== newContent) {
  fs.writeFileSync(path, newContent);
  console.log('Successfully updated schema IDs');
} else {
  console.log('No changes needed or regex didn\'t match');
}
