/**
 * Utility for generating 3-letter user trigrams.
 */

/**
 * Generates a single trigram for a user given the context of already taken trigrams.
 * 
 * Policy:
 * 1. Base: First letter of First Name + First letter of Last Name + Second letter of Last Name.
 * 2. Exception 1: Composed first name (e.g. Pierre-Antoine) -> First of First + First of Second Name + First of Last Name (PAB).
 * 3. Exception 2: Collision -> Use next letter of family name.
 *    - If FLL (First-Last-Last[1]) is taken, try FLL[Last] (Last char)
 *    - Then try FLL[2], FLL[3], etc.
 * 
 * @param firstName User's first name
 * @param lastName User's last name
 * @param takenTrigrams Set of trigrams that are already in use
 * @returns A unique 3-letter trigram
 */
export const generateTrigram = (
    firstName: string,
    lastName: string,
    takenTrigrams: Set<string> = new Set()
): string => {
    const cleanFirst = firstName.trim().toUpperCase();
    const cleanLast = lastName.trim().toUpperCase();

    if (!cleanFirst || !cleanLast) return "???";

    const f = cleanFirst.charAt(0);
    const l = cleanLast.charAt(0);

    // Helper to check and return if available
    const tryTrigram = (t: string): string | null => {
        if (t.length !== 3) return null;
        if (!takenTrigrams.has(t)) return t;
        return null;
    };

    // 1. Check for Composed First Name (e.g. Pierre-Antoine)
    // Split by hyphen or space
    const firstParts = cleanFirst.split(/[- ]+/);
    if (firstParts.length > 1) {
        const p1 = firstParts[0].charAt(0);
        const p2 = firstParts[1].charAt(0);
        const candidate = p1 + p2 + l;
        const res = tryTrigram(candidate);
        if (res) return res;
    }

    // 2. Standard Pattern: F + L + L[1]
    // If last name has at least 2 chars
    if (cleanLast.length >= 2) {
        const candidate = f + l + cleanLast.charAt(1);
        const res = tryTrigram(candidate);
        if (res) return res;
    } else {
        // Fallback for 1-letter surname: F + L + L (duplicate)? Or just pad?
        // Let's treat it as collision scenarios below will handle it if we consider 'padding' or just 
        // duplicate the last char if needed. But strictly following "Second letter of family name":
        // If undefined, maybe duplication is better than nothing?
        const candidate = f + l + l;
        const res = tryTrigram(candidate);
        if (res) return res;
    }

    // 3. Collision Handling
    // Rule: "instead of second letter of the familiy name, use the last one"
    if (cleanLast.length > 0) {
        const lastChar = cleanLast.charAt(cleanLast.length - 1);
        const candidate = f + l + lastChar;
        const res = tryTrigram(candidate);
        if (res) return res;
    }

    // Rule: "If above rule leads again to an already used trigram take the third letter of the familiy name and so on"
    // We start from index 2 since index 1 was the standard attempt.
    // We already tried the "last one" separately.
    // So we iterate k=2 to length-1 (excluding last one as we tried it, but trying it again won't hurt if loop covers it)
    // The "last one" check above is explicit as per requirements.
    // The loop "third letter and so on" implies indices 2, 3, 4...

    for (let i = 2; i < cleanLast.length; i++) {
        // Optimization: checking the last char again is redundant but safe.
        const candidate = f + l + cleanLast.charAt(i);
        const res = tryTrigram(candidate);
        if (res) return res;
    }

    // If completely exhausted (e.g. "Li"), and still colliding? 
    // We might need a numeric fallback or similar, but spec doesn't say.
    // Let's try adding numbers if name exhausted?
    // Requirement says "until their is a free usable trigram".
    // Assuming names are distinct enough or we can use numbers.
    for (let i = 1; i <= 99; i++) {
        const candidate = f + l + i.toString();
        // Take first 3 chars if number makes it long? No, we want 3 letters constant usually?
        // But if we insert numbers, it fits 3 chars: FL1, FL2...
        const res = tryTrigram(candidate.substring(0, 3));
        if (res) return res;
    }

    return f + l + "X"; // Ultimate fallback
};

/**
 * Assigns trigrams to a list of users.
 * To ensure stability, users updates should ideally be deterministic.
 * However, since this runs on the client, if the list order changes, trigrams might flip for colliding users.
 * Ideally, we sort users by ID or creation date before assigning to maximize stability.
 */
export const assignTrigrams = (users: { userId: string; username: string; trigram?: string }[]): Record<string, string> => {
    // Sort logic to ensure stability
    // We assume userId is stable.
    const sorted = [...users].sort((a, b) => a.userId.localeCompare(b.userId));

    const mapping: Record<string, string> = {};
    const taken = new Set<string>();

    // Pass 1: Reserve existing persisted trigrams
    for (const u of sorted) {
        if (u.trigram) {
            mapping[u.userId] = u.trigram;
            taken.add(u.trigram);
        }
    }

    // Pass 2: Assign trigrams to users who don't have one yet
    for (const u of sorted) {
        if (mapping[u.userId]) continue; // Already handled in Pass 1

        // Extract names. Assumption: username is "First Last"
        const parts = u.username.split(' ');
        let firstName = parts[0] || "";
        let lastName = parts.slice(1).join(' ') || "";

        // Fallback if no space
        if (!lastName) {
            lastName = firstName; // Or handle differently
            firstName = firstName.charAt(0); // Dummy split?
        }

        const trigram = generateTrigram(firstName, lastName, taken);
        mapping[u.userId] = trigram;
        taken.add(trigram);
    }

    return mapping;
};
