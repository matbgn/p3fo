import { generateTrigram, assignTrigrams } from '../utils/userTrigrams';

const testCases = [
    { first: "Matthieu", last: "Borgognon", expected: "MBO" }, // Standard: M + B + o
    { first: "Pierre-Antoine", last: "Bonvin", expected: "PAB" }, // Composed: P + A + B
    { first: "John", last: "Doe", expected: "JDO" }, // Standard: J + D + o
];

console.log("--- Unit Tests ---");
const taken = new Set<string>();
testCases.forEach(tc => {
    const res = generateTrigram(tc.first, tc.last, taken);
    console.log(`${tc.first} ${tc.last} -> ${res} (Expected: ${tc.expected}) ${res === tc.expected ? "✅" : "❌"}`);
    // We don't add to taken here to test pure generation logic independent of state, 
    // unless we want to test collision specifically.
});

console.log("\n--- Collision Tests ---");
// Scenario: Multiple Matthieu Borgognon's
const users = [
    { userId: "1", username: "Matthieu Borgognon" },
    { userId: "2", username: "Matthieu Borgognon" }, // Collision 1
    { userId: "3", username: "Matthieu Borgognon" }, // Collision 2
    { userId: "4", username: "Matthieu Borgognon" }, // Collision 3
    { userId: "5", username: "Matthieu Borgognon" }, // Collision 4
];

const assigned = assignTrigrams(users);
console.log("Assignments:", assigned);

// Expected:
// 1. MBO (Standard)
// 2. MBN (Last Char: n)
// 3. MBG (3rd Char: r... wait, 3rd char of "Borgognon" is 'r'.
// Let's trace logic:
// - MBO taken.
// - Check Last: MBN. 
// - Check loop i=2 ('r'): MBR.
// - Check loop i=3 ('g'): MBG.
// So order depends on which rule triggers first.
// The policy says: "instead of second letter ... use the last one". So Last Char is Priority 1 fallback.
// "If above rule leads again ... take the third letter ... and so on". Loop is Priority 2 fallback.

// So:
// User 1: MBO
// User 2: MBN (Last char)
// User 3: MBR (3rd char 'r')
// User 4: MBG (4th char 'g')
// User 5: MBO (5th char 'o') -> TAKEN!
// User 5 -> MBG (6th char 'g') -> TAKEN (by User 4? No wait, user 4 took the first 'g' at index 4?)
// string is B o r g o g n o n
// 012345678
// Standard: index 1 ('o'). -> MBO
// Last: index 8 ('n'). -> MBN

// Loop:
// i=2: 'r' -> MBR
// i=3: 'g' -> MBG
// i=4: 'o' -> MBO (Taken)
// i=5: 'g' -> MBG (Taken? Yes if MBG generated earlier)
// i=6: 'n' -> MBN (Taken)
// i=7: 'o' -> MBO (Taken)

// So User 5 should get... what?
// If MBG (i=3) is taken by User 4?
// Let's verify strict order.
