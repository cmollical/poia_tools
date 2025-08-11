const { executeSnowflakeQuery } = require('./dbUtils');

// Add the users you want to insert into this array
const usersToInsert = [
    {
        user_name: 'cmollica',
        first_name: 'Charles',
        role: 'user'
    },
    {
        user_name: 'mpardun',
        first_name: 'Mike',
        role: 'user'
    },
    {
        user_name: 'ccross',
        first_name: 'Cassie',
        role: 'user'
    }
];

async function seedUsers() {
    console.log('Starting to seed users...');

    for (const user of usersToInsert) {
        // First, check if the user already exists to avoid duplicates
        const checkUserSql = `SELECT COUNT(*) AS count FROM corpanalytics_business_prod.scratchpad_prdpf.cora_login WHERE user_name = ?`;
        try {
            const rows = await executeSnowflakeQuery(checkUserSql, [user.user_name]);
            if (rows[0].COUNT > 0) {
                console.log(`User '${user.user_name}' already exists. Skipping.`);
                continue; // Skip to the next user
            }
        } catch (err) {
            console.error(`Error checking if user '${user.user_name}' exists:`, err.message);
            continue; // Skip to the next user on error
        }

        // If the user does not exist, insert the new record
        const insertSql = `
            INSERT INTO corpanalytics_business_prod.scratchpad_prdpf.cora_login (user_name, first_name, \"ROLE\", created_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP);
        `;
        try {
            await executeSnowflakeQuery(insertSql, [user.user_name, user.first_name, user.role]);
            console.log(`Successfully inserted user: ${user.user_name}`);
        } catch (err) {
            console.error(`Failed to insert user ${user.user_name}:`, err.message);
        }
    }

    console.log('User seeding process complete.');
}

// Run the seeding function
seedUsers();
