# User Trigram Policy

This document defines the standard for generating 3-letter user trigrams (initials) across the application.

## Goal
To visually identify users with a short, consistent 3-letter code.

## Format
Trigrams are always 3 uppercase alphanumeric characters.

## Generation Logic

### 1. Standard Case
**Pattern**: `[First Name Initial] + [Last Name Initial] + [Last Name 2nd Letter]`

*Example*: 
- **M**atthieu **Bo**rgognon -> **MBO**

### 2. Composed First Names (Priority Exception)
If a user has a composed first name (hyphenated or space-separated), we prioritize the initials of the first name parts.

**Pattern**: `[First Name Part 1 Initial] + [First Name Part 2 Initial] + [Last Name Initial]`

*Example*:
- **P**ierre-**A**ntoine **B**onvin -> **PAB**

### 3. Collision Handling
If a generated trigram is already taken by another user (who claimed it first based on system stability rules, usually ID sort order), we apply the following fallback strategy in strict order:

1. **Use Last Letter**: Replace the 3rd character with the *last* letter of the surname.
   - *Example*: **M**atthieu **B**orgogno**n** -> **MBN**

2. **Iterate Surname**: Iterate through the surname starting from the 3rd letter (index 2) onwards.
   - *Example*:
     - **M**atthieu **B**or**g**ognon -> **MBG**
     - **M**atthieu **B**org**o**gnon -> **MBO** (Taken)
     - **M**atthieu **B**orgo**g**non -> **MBG** (Taken)
     - ...

3. **Numeric Fallback**: If all letter combinations are exhausted, append numbers.
   - *Example*: **MB1**, **MB2**...

## Implementation Details
- The system calculates these assignments globally based on the active user list.
- Assignments are stable based on User ID sorting ensuring determinism.
