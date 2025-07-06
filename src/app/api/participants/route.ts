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
    user_hackathon_extras?: { value: string }[];
};

// Add a SyncState model to track progress
type SyncState = {
    lastProcessedIndex: number;
    lastSyncTime: Date;
    totalParticipants: number;
};

async function fetchUserExtras(username: string) {
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

        if (!res.ok) throw new Error(`API request failed with status ${res.status}`);
        
        const data: DevfolioExtras = await res.json();
        const extraValues = data.user_hackathon_extras?.map((e) => e.value) || [];

        return {
            username: data.username,
            email: data.email,
            name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim(),
            hackathon_extras: extraValues,
            lastUpdated: new Date()
        };
    } catch (err) {
        console.error(`❌ Error for ${username}:`, err);
        return null;
    }
}

type SyncStateData = {
    lastProcessedIndex: number;
    lastSyncTime: Date;
    totalParticipants: number;
    isActive: boolean;
    batchSize: number;
};

async function getSyncState(): Promise<SyncStateData> {
    const hackathonId = 'hackodisha-4';
    try {
        const state = await SyncState.findOne({ hackathonId });
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
        console.log('No sync state found, starting fresh', err);
    }
    
    return {
        lastProcessedIndex: 0,
        lastSyncTime: new Date(0),
        totalParticipants: 0,
        isActive: false,
        batchSize: 10
    };
}

async function updateSyncState(state: SyncStateData) {
    const hackathonId = 'hackodisha-4';
    try {
        await SyncState.findOneAndUpdate(
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
            { upsert: true }
        );
    } catch (err) {
        console.error('Failed to update sync state:', err);
    }
}

export async function GET() {
    await dbConnect();

    try {
        // Get current sync state
        const syncState = await getSyncState();
        
        // Check if sync is already active (prevent concurrent syncs)
        if (syncState.isActive) {
            // Check if the sync has been active for too long (e.g., 30 minutes)
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
            
            if (syncState.lastSyncTime < thirtyMinutesAgo) {
                console.log('⚠️ Sync was stuck in active state, resetting...');
                // Reset the stuck sync
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

        // First, fetch ALL participants to get the complete list
        const allParticipantsFromAPI = [];
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

            const response = await fetch(`https://api.devfolio.co/api/hackathons/hackodisha-4/participants?${params}`, { 
                headers,
                cache: 'no-store'
            });

            const data: { result: DevfolioParticipant[] } = await response.json();
            const participants = data.result;
            if (!participants.length) break;

            allParticipantsFromAPI.push(...participants);
            page++;
        }

        console.log(`📥 Fetched ${allParticipantsFromAPI.length} total participants from API`);

        // Determine which users need to be processed
        let usersToProcess = [];
        
        // Check if this is a fresh start or continuation
        if (syncState.lastProcessedIndex === 0) {
            // Fresh start - process all users
            usersToProcess = allParticipantsFromAPI;
            console.log(`🔄 Fresh sync - processing all ${usersToProcess.length} users`);
        } else {
            // Continuation - check if new users were added
            const totalCurrentUsers = allParticipantsFromAPI.length;
            
            if (totalCurrentUsers > syncState.totalParticipants) {
                // New users added - process only the new ones
                usersToProcess = allParticipantsFromAPI.slice(syncState.lastProcessedIndex);
                console.log(`➕ Found ${usersToProcess.length} new users to process`);
            } else if (totalCurrentUsers === syncState.totalParticipants) {
                // No new users - check if we need to continue from where we left off
                if (syncState.lastProcessedIndex < totalCurrentUsers) {
                    usersToProcess = allParticipantsFromAPI.slice(syncState.lastProcessedIndex);
                    console.log(`⏭️ Continuing from index ${syncState.lastProcessedIndex} - ${usersToProcess.length} users remaining`);
                } else {
                    console.log(`✅ All users already processed - no work needed`);
                    return NextResponse.json({
                        success: true,
                        message: 'All participants already synchronized',
                        totalParticipants: totalCurrentUsers,
                        lastProcessedIndex: syncState.lastProcessedIndex,
                        timestamp: new Date().toISOString()
                    });
                }
            } else {
                // Total users decreased (rare case) - start fresh
                usersToProcess = allParticipantsFromAPI;
                syncState.lastProcessedIndex = 0;
                console.log(`🔄 User count decreased - starting fresh sync`);
            }
        }

        // Process users in batches to avoid overwhelming the API
        const batchSize = syncState.batchSize || 10;
        const processedUsers = [];
        let currentIndex = syncState.lastProcessedIndex;
        
        for (let i = 0; i < usersToProcess.length; i += batchSize) {
            const batch = usersToProcess.slice(i, i + batchSize);
            console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(usersToProcess.length/batchSize)}`);
            
            const batchResults = await Promise.all(
                batch.map(async (p) => {
                    const username = p.user?.username;
                    if (!username) return null;

                    const info = await fetchUserExtras(username);
                    if (!info) return null;

                    await Participant.findOneAndUpdate(
                        { username },
                        { $set: info },
                        { upsert: true }
                    );

                    return info;
                })
            );

            const validResults = batchResults.filter(Boolean);
            processedUsers.push(...validResults);
            
            // Update current index
            currentIndex += batch.length;
            
            // Update sync state after each batch
            await updateSyncState({
                lastProcessedIndex: currentIndex,
                lastSyncTime: new Date(),
                totalParticipants: allParticipantsFromAPI.length,
                isActive: true,
                batchSize: syncState.batchSize
            });
            
            console.log(`✅ Processed batch - new index: ${currentIndex}`);
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`🎉 Sync completed - processed ${processedUsers.length} users`);

        // Mark sync as completed
        await updateSyncState({
            lastProcessedIndex: currentIndex,
            lastSyncTime: new Date(),
            totalParticipants: allParticipantsFromAPI.length,
            isActive: false,
            batchSize: syncState.batchSize
        });

        return NextResponse.json({
            success: true,
            count: processedUsers.length,
            totalParticipants: allParticipantsFromAPI.length,
            lastProcessedIndex: currentIndex,
            participants: processedUsers,
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('❌ Sync error:', err);
        
        // Mark sync as inactive on error
        try {
            const currentState = await getSyncState();
            await updateSyncState({ ...currentState, isActive: false });
        } catch (updateErr) {
            console.error('Failed to update sync state after error:', updateErr);
        }
        
        return NextResponse.json(
            { 
                error: 'Failed to fetch', 
                details: err instanceof Error ? err.message : String(err) 
            },
            { status: 500 }
        );
    }
}