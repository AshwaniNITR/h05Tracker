import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { Participant, SyncState } from '@/models/Participant';

const headers = {
    'cookie': process.env.DEVFOLIO_COOKIE || 'your-cookie-here',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Accept': 'application/json'
};

type DevfolioParticipant = {
    user: {
        username: string;
        first_name?: string;
        last_name?: string;
        email?: string;
    };
};

type DevfolioExtras = {
    username: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    user_hackathon_extras?: { 
        uuid: string;
        value: string;
        hackathon_scope_extra?: {
            uuid: string;
            name: string;
            required: boolean;
            desc: string;
            type: string;
        };
    }[] | string;
};

type ProcessedParticipant = {
    username: string;
    email: string;
    name: string;
    hackathon_extras: string[];
    lastUpdated: Date;
};

type SyncStateType = {
    lastProcessedIndex: number;
    lastSyncTime: Date;
    totalParticipants: number;
    isActive: boolean;
    batchSize: number;
};

// Fixed function to properly extract hackathon extras
async function fetchUserExtras(username: string): Promise<ProcessedParticipant | null> {
    try {
        const params = new URLSearchParams({
            hackathon_scope_extra_attributes: 'uuid,name,required,desc,type',
            profile_attributes: 'name',
            user_attributes: 'first_name,last_name,username,dob,email,uuid,bio,short_bio,status',
            user_extra_attributes: 'resume',
            user_hackathon_attributes: 'uuid,status,ticket,note,ai_assisted_score,ai_assisted_status,ai_assisted_reason',
            user_hackathon_extra_attributes: 'uuid,value'
        });

        const res = await fetch(`https://api.devfolio.co/api/hackathons/hackodisha-4/participants/${username}?${params}`, { 
            headers,
            next: { revalidate: 60 }
        });

        if (!res.ok) {
            console.error(`❌ API request failed for ${username}: ${res.status} ${res.statusText}`);
            return null;
        }
        
        const data: DevfolioExtras = await res.json();
        console.log(`📋 Raw API data for ${username}:`, JSON.stringify(data, null, 2));
        
        // FIXED: Properly handle hackathon extras
        let extraValues: string[] = [];
        
        if (data.user_hackathon_extras) {
            // Check if it's already a string (which shouldn't happen but seems to be the case)
            if (typeof data.user_hackathon_extras === 'string') {
                console.warn(`⚠️ user_hackathon_extras is a string for ${username}, attempting to parse...`);
                try {
                    // Try to parse it as JSON
                    const parsed = JSON.parse(data.user_hackathon_extras);
                    if (Array.isArray(parsed)) {
                        extraValues = parsed.map((extra: { value?: string }) => extra.value || '').filter((value: string) => value !== '');
                    }
                } catch (parseError) {
                    console.error(`❌ Failed to parse user_hackathon_extras for ${username}:`, parseError);
                    extraValues = []; // Default to empty array
                }
            } else if (Array.isArray(data.user_hackathon_extras)) {
                // Normal case - it's an array
                extraValues = data.user_hackathon_extras.map((extra) => {
                    return extra.value || '';
                }).filter(value => value !== '');
            } else {
                console.warn(`⚠️ user_hackathon_extras is neither string nor array for ${username}:`, typeof data.user_hackathon_extras);
                extraValues = [];
            }
        }

        const result: ProcessedParticipant = {
            username: data.username,
            email: data.email || `${username}@example.com`,
            name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || username,
            hackathon_extras: extraValues,
            lastUpdated: new Date()
        };

        console.log(`✅ Processed data for ${username}:`, result);
        console.log(`📝 Hackathon extras (${extraValues.length}):`, extraValues);
        
        return result;
    } catch (err) {
        console.error(`❌ Error fetching data for ${username}:`, err);
        return null;
    }
}

// Enhanced validation function
function validateParticipantData(info: ProcessedParticipant): boolean {
    const errors: string[] = [];
    
    if (!info.username || typeof info.username !== 'string') {
        errors.push('username is required and must be a string');
    }
    
    if (!info.email || typeof info.email !== 'string') {
        errors.push('email is required and must be a string');
    }
    
    if (!info.name || typeof info.name !== 'string') {
        errors.push('name is required and must be a string');
    }
    
    // Validate hackathon_extras is an array of strings
    if (!Array.isArray(info.hackathon_extras)) {
        errors.push('hackathon_extras must be an array');
    } else {
        // Check each item in hackathon_extras is a string
        for (let i = 0; i < info.hackathon_extras.length; i++) {
            if (typeof info.hackathon_extras[i] !== 'string') {
                errors.push(`hackathon_extras[${i}] must be a string`);
            }
        }
    }
    
    if (errors.length > 0) {
        console.warn('⚠️ Invalid participant data:', info);
        console.warn('⚠️ Validation errors:', errors);
        return false;
    }
    
    return true;
}

async function getSyncState(): Promise<SyncStateType> {
    const hackathonId = 'hackodisha-4';
    try {
        console.log('📊 Getting sync state...');
        const state = await SyncState.findOne({ hackathonId });
        console.log('📊 Current sync state:', state);
        
        if (state) {
            return {
                lastProcessedIndex: state.lastProcessedIndex || 0,
                lastSyncTime: state.lastSyncTime || new Date(0),
                totalParticipants: state.totalParticipants || 0,
                isActive: state.isActive || false,
                batchSize: state.batchSize || 10
            };
        }
    } catch (err) {
        console.error('❌ Error getting sync state:', err);
    }
    
    return {
        lastProcessedIndex: 0,
        lastSyncTime: new Date(0),
        totalParticipants: 0,
        isActive: false,
        batchSize: 10
    };
}

async function updateSyncState(state: SyncStateType) {
    const hackathonId = 'hackodisha-4';
    try {
        console.log('💾 Updating sync state:', state);
        const result = await SyncState.findOneAndUpdate(
            { hackathonId },
            { 
                $set: {
                    lastProcessedIndex: state.lastProcessedIndex,
                    lastSyncTime: state.lastSyncTime,
                    totalParticipants: state.totalParticipants,
                    isActive: state.isActive,
                    batchSize: state.batchSize
                }
            },
            { upsert: true, new: true }
        );
        console.log('✅ Sync state updated successfully');
        return result;
    } catch (err) {
        console.error('❌ Failed to update sync state:', err);
        throw err;
    }
}

export async function GET() {
    try {
        // Connect to database
        console.log('🔌 Connecting to database...');
        await dbConnect();
        console.log('✅ Database connected');

        // Test database connection
        const participantCount = await Participant.countDocuments();
        const syncStateCount = await SyncState.countDocuments();
        console.log(`📊 Current DB state: ${participantCount} participants, ${syncStateCount} sync states`);

        // Get current sync state
        const syncState = await getSyncState();
        
        // Check if sync is already active
        if (syncState.isActive) {
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
            
            if (syncState.lastSyncTime < thirtyMinutesAgo) {
                console.log('⚠️ Sync was stuck in active state, resetting...');
                await updateSyncState({ ...syncState, isActive: false });
            } else {
                return NextResponse.json({
                    success: false,
                    message: 'Sync already in progress',
                    lastSyncTime: syncState.lastSyncTime,
                    timestamp: new Date().toISOString()
                }, { status: 409 });
            }
        }
        
        // Mark sync as active
        await updateSyncState({ ...syncState, isActive: true });
        
        console.log(`📊 Starting sync from index: ${syncState.lastProcessedIndex}`);

        // Fetch participants from API
        console.log('📥 Fetching participants from API...');
        const allParticipantsFromAPI: DevfolioParticipant[] = [];
        let page = 1;
        const limit = 200;

        while (true) {
            const params = new URLSearchParams({
                limit: limit.toString(),
                page: page.toString(),
                order: 'DESC',
                role: 'hacker',
                status: 'submit',
                user: 'eyJzdGF0dXMiOiJhY3RpdmUifQ%3D%3D'
            });

            console.log(`📄 Fetching page ${page}...`);
            const response = await fetch(`https://api.devfolio.co/api/hackathons/hackodisha-4/participants?${params}`, { 
                headers,
                cache: 'no-store'
            });

            if (!response.ok) {
                console.error(`❌ API request failed for page ${page}: ${response.status} ${response.statusText}`);
                break;
            }

            const data = await response.json();
            const participants = data.result || [];
            
            console.log(`📋 Page ${page} returned ${participants.length} participants`);
            
            if (!participants.length) break;

            allParticipantsFromAPI.push(...participants);
            page++;
        }

        const totalParticipants = allParticipantsFromAPI.length;
        console.log(`📥 Total participants fetched: ${totalParticipants}`);

        if (totalParticipants === 0) {
            console.log('⚠️ No participants found from API');
            await updateSyncState({ ...syncState, isActive: false });
            return NextResponse.json({
                success: false,
                message: 'No participants found from API',
                timestamp: new Date().toISOString()
            });
        }

        // INCREMENTAL SYNC LOGIC
        const batchSize = 5; // Reduced batch size for better error handling
        const processedUsers: ProcessedParticipant[] = [];
        let currentIndex = syncState.lastProcessedIndex;
        let newParticipants = 0;
        let updatedParticipants = 0;
        let skippedParticipants = 0;
        let failedParticipants = 0;
        const failedUsernames: string[] = [];
        
        console.log(`📊 Sync Strategy Decision:`);
        console.log(`   - Previous total: ${syncState.totalParticipants}`);
        console.log(`   - Current total: ${totalParticipants}`);
        console.log(`   - Last processed index: ${currentIndex}`);
        
        let usersToProcess: DevfolioParticipant[] = [];
        let syncType = '';
        
        if (currentIndex >= syncState.totalParticipants && totalParticipants > syncState.totalParticipants) {
            // CASE 1: Previous sync completed, now we have NEW participants
            const newParticipantCount = totalParticipants - syncState.totalParticipants;
            usersToProcess = allParticipantsFromAPI.slice(syncState.totalParticipants);
            currentIndex = syncState.totalParticipants; // Start from where we left off
            syncType = `NEW_PARTICIPANTS (${newParticipantCount} new)`;
            console.log(`🆕 Detected ${newParticipantCount} new participants`);
            
        } else if (currentIndex < totalParticipants) {
            // CASE 2: Previous sync incomplete, continue from where we left off
            usersToProcess = allParticipantsFromAPI.slice(currentIndex);
            syncType = `CONTINUE_SYNC (${totalParticipants - currentIndex} remaining)`;
            console.log(`⏭️ Continuing previous sync from index ${currentIndex}`);
            
        } else if (totalParticipants === syncState.totalParticipants) {
            // CASE 3: Same number of participants, check for updates or missing data
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            
            // Check if database count matches expected count
            const expectedDBCount = totalParticipants;
            const actualDBCount = participantCount;
            
            console.log(`📊 Database integrity check:`);
            console.log(`   - Expected DB count: ${expectedDBCount}`);
            console.log(`   - Actual DB count: ${actualDBCount}`);
            console.log(`   - Missing participants: ${expectedDBCount - actualDBCount}`);
            
            if (actualDBCount < expectedDBCount) {
                // We have missing participants in the database
                console.log(`🔍 Database integrity issue detected! Missing ${expectedDBCount - actualDBCount} participants`);
                
                // Find which participants are missing
                const apiUsernames = allParticipantsFromAPI.map(p => p.user?.username).filter(Boolean);
                const dbParticipants = await Participant.find({}, { username: 1 });
                const dbUsernames = dbParticipants.map(p => p.username);
                
                const missingUsernames = apiUsernames.filter(username => !dbUsernames.includes(username));
                console.log(`🔍 Missing usernames (${missingUsernames.length}):`, missingUsernames);
                
                // Process only missing participants
                usersToProcess = allParticipantsFromAPI.filter(p => 
                    missingUsernames.includes(p.user?.username)
                );
                currentIndex = 0; // Start fresh for missing participants
                syncType = `MISSING_PARTICIPANTS (${missingUsernames.length} missing from DB)`;
                console.log(`🔄 Processing ${missingUsernames.length} missing participants`);
                
            } else if (syncState.lastSyncTime < oneHourAgo) {
                // Check for updates in existing participants
                usersToProcess = allParticipantsFromAPI;
                currentIndex = 0;
                syncType = `UPDATE_CHECK (checking all ${totalParticipants} for changes)`;
                console.log(`🔄 Checking for updates in existing participants`);
            } else {
                console.log(`✅ No new participants and recent sync found, database is in sync`);
                await updateSyncState({ ...syncState, isActive: false });
                return NextResponse.json({
                    success: true,
                    message: 'No new participants found and database is in sync',
                    count: 0,
                    totalParticipants: totalParticipants,
                    lastProcessedIndex: currentIndex,
                    finalDBCount: participantCount,
                    syncType: 'NO_CHANGES',
                    timestamp: new Date().toISOString()
                });
            }
        } else {
            // CASE 4: Total participants decreased (rare)
            console.log(`⚠️ Total participants decreased from ${syncState.totalParticipants} to ${totalParticipants}`);
            usersToProcess = allParticipantsFromAPI;
            currentIndex = 0;
            syncType = `FULL_RESYNC (participant count decreased)`;
        }
        
        console.log(`🔄 Sync Type: ${syncType}`);
        console.log(`📊 Processing ${usersToProcess.length} participants starting from index ${currentIndex}`);
        
        // Process participants one by one for better error handling
        for (let i = 0; i < usersToProcess.length; i++) {
            const participant = usersToProcess[i];
            const username = participant.user?.username;
            
            console.log(`\n👤 Processing ${i + 1}/${usersToProcess.length}: ${username || 'UNKNOWN'} (global index: ${currentIndex})`);
            
            if (!username) {
                console.warn('⚠️ Skipping participant without username:', participant);
                skippedParticipants++;
                if (syncType !== 'MISSING_PARTICIPANTS') {
                    currentIndex++;
                }
                continue;
            }

            try {
                const info = await fetchUserExtras(username);
                if (!info) {
                    console.warn(`⚠️ Failed to get info for ${username}`);
                    failedParticipants++;
                    failedUsernames.push(username);
                    if (syncType !== 'MISSING_PARTICIPANTS') {
                        currentIndex++;
                    }
                    continue;
                }

                if (!validateParticipantData(info)) {
                    console.warn(`⚠️ Invalid data for ${username}, skipping`);
                    skippedParticipants++;
                    if (syncType !== 'MISSING_PARTICIPANTS') {
                        currentIndex++;
                    }
                    continue;
                }

                console.log(`💾 Saving participant: ${username}`);
                
                // Check if participant already exists
                const existingParticipant = await Participant.findOne({ username });
                
                if (existingParticipant) {
                    console.log(`📝 Found existing participant: ${username}`);
                    
                    // Check if data actually changed
                    const hasChanges = JSON.stringify(existingParticipant.hackathon_extras) !== JSON.stringify(info.hackathon_extras) ||
                                     existingParticipant.email !== info.email ||
                                     existingParticipant.name !== info.name;
                    
                    if (hasChanges) {
                        console.log(`🔄 Data changed, updating: ${username}`);
                        await Participant.findOneAndUpdate(
                            { username },
                            { $set: info },
                            { new: true }
                        );
                        console.log(`✅ Updated existing participant: ${username}`);
                        updatedParticipants++;
                    } else {
                        console.log(`✅ No changes for existing participant: ${username}`);
                    }
                } else {
                    console.log(`🆕 Creating new participant: ${username}`);
                    const savedParticipant = await Participant.create(info);
                    console.log(`✅ Added new participant: ${username} (ID: ${savedParticipant._id})`);
                    newParticipants++;
                }
                
                processedUsers.push(info);
                if (syncType !== 'MISSING_PARTICIPANTS') {
                    currentIndex++;
                }
                
                // Verify the save worked
                const verifyParticipant = await Participant.findOne({ username });
                if (!verifyParticipant) {
                    console.error(`❌ VERIFICATION FAILED: ${username} not found in database after save!`);
                    failedParticipants++;
                    failedUsernames.push(username);
                } else {
                    console.log(`✅ Verified: ${username} successfully saved`);
                }
                
            } catch (dbError) {
                console.error(`❌ Database error for ${username}:`, dbError);
                failedParticipants++;
                failedUsernames.push(username);
                if (syncType !== 'MISSING_PARTICIPANTS') {
                    currentIndex++;
                }
                continue;
            }
            
            // Update sync state more frequently
            if (i % 5 === 0 || i === usersToProcess.length - 1) {
                // For missing participants, we don't increment the main index
                const indexToSave = syncType === 'MISSING_PARTICIPANTS' ? syncState.lastProcessedIndex : currentIndex;
                
                await updateSyncState({
                    lastProcessedIndex: indexToSave,
                    lastSyncTime: new Date(),
                    totalParticipants: totalParticipants,
                    isActive: true,
                    batchSize: batchSize
                });
                
                console.log(`📊 Progress saved - index: ${indexToSave}/${totalParticipants}`);
                
                // Check current database count
                const currentDBCount = await Participant.countDocuments();
                console.log(`📊 Current DB count: ${currentDBCount}`);
            }
            
            // Delay between requests to avoid overwhelming the API
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Determine if sync is complete
        const isComplete = syncType === 'MISSING_PARTICIPANTS' ? true : currentIndex >= totalParticipants;
        
        console.log(`\n🎉 Sync completed:`);
        console.log(`   - New participants: ${newParticipants}`);
        console.log(`   - Updated participants: ${updatedParticipants}`);
        console.log(`   - Skipped participants: ${skippedParticipants}`);
        console.log(`   - Failed participants: ${failedParticipants}`);
        console.log(`   - Total processed: ${processedUsers.length}`);
        console.log(`   - Progress: ${currentIndex}/${totalParticipants}`);
        console.log(`   - Complete: ${isComplete}`);
        
        if (failedUsernames.length > 0) {
            console.log(`⚠️ Failed usernames: ${failedUsernames.join(', ')}`);
        }

        // Mark sync as completed
        const finalIndex = syncType === 'MISSING_PARTICIPANTS' ? syncState.lastProcessedIndex : currentIndex;
        
        await updateSyncState({
            lastProcessedIndex: finalIndex,
            lastSyncTime: new Date(),
            totalParticipants: totalParticipants,
            isActive: false,
            batchSize: batchSize
        });

        // Final database check
        const finalCount = await Participant.countDocuments();
        console.log(`📊 Final participant count in DB: ${finalCount}`);
        
        // Check for discrepancies
        const expectedCount = participantCount + newParticipants;
        if (finalCount !== expectedCount) {
            console.warn(`⚠️ Database count mismatch! Expected: ${expectedCount}, Actual: ${finalCount}`);
        }

        return NextResponse.json({
            success: true,
            syncType: syncType,
            count: processedUsers.length,
            newParticipants: newParticipants,
            updatedParticipants: updatedParticipants,
            skippedParticipants: skippedParticipants,
            failedParticipants: failedParticipants,
            failedUsernames: failedUsernames,
            totalParticipants: totalParticipants,
            lastProcessedIndex: currentIndex,
            initialDBCount: participantCount,
            finalDBCount: finalCount,
            progress: `${currentIndex}/${totalParticipants}`,
            isComplete: isComplete,
            participants: processedUsers.length <= 10 ? processedUsers : processedUsers.slice(0, 10),
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('❌ Sync error:', err);
        
        // Mark sync as inactive on error
        try {
            const currentState = await getSyncState();
            await updateSyncState({ ...currentState, isActive: false });
        } catch (updateErr) {
            console.error('❌ Failed to update sync state after error:', updateErr);
        }
        
        return NextResponse.json(
            { 
                success: false,
                error: 'Failed to sync', 
                details: err instanceof Error ? err.message : String(err),
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}