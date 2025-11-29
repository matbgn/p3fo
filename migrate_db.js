
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('./p3fo.db');

try {
    console.log('Checking columns...');
    const columns = db.prepare("PRAGMA table_info(user_settings)").all();
    const hasWorkload = columns.some(c => c.name === 'workload');

    if (!hasWorkload) {
        console.log('Adding workload column...');
        db.exec("ALTER TABLE user_settings ADD COLUMN workload REAL DEFAULT 60");
        console.log('Column added.');

        // Check if workload_percentage exists to migrate data
        const hasWorkloadPercentage = columns.some(c => c.name === 'workload_percentage');
        if (hasWorkloadPercentage) {
            console.log('Migrating data from workload_percentage...');
            db.exec("UPDATE user_settings SET workload = workload_percentage");
            console.log('Data migrated.');
        }
    } else {
        console.log('workload column already exists.');
    }
} catch (error) {
    console.error('Migration failed:', error);
}
