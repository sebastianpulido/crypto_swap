const crypto = require('crypto');

// Your secret from the output
const secret = 'c4506a2ae19e9cfd4fce75888510a0355262e4b2b093eec0d45185e632ecfa3f';

// Calculate the correct hash
const hash = crypto.createHash('sha256').update(Buffer.from(secret, 'hex')).digest('hex');
const hashedSecret = '0x' + hash;

console.log('Original Secret:', secret);
console.log('Correct Hashed Secret:', hashedSecret);
console.log('Your Broken Hash:', '0x197f63a4c603c215184dd85a29706392eleabb526f9397187d87b65ecae952d2');
console.log('Fixed?', hashedSecret === '0x197f63a4c603c215184dd85a29706392eleabb526f9397187d87b65ecae952d2' ? 'NO - Different hash!' : 'Hash recalculated');