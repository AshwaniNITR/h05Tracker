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

async function fetchAllParticipantsFromAPI(): Promise<DevfolioParticipant[]> {
    const allParticipants: DevfolioParticipant[] = [];
    let page = 1;
    const limit = 200;
    const maxPages = 20; // Safety limit

    while (page <= maxPages) {
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

        allParticipants.push(...participants);
        page++;
    }

    return allParticipants;
}

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
        
        let extraValues: string[] = [];
        
        if (data.user_hackathon_extras) {
            if (typeof data.user_hackathon_extras === 'string') {
                try {
                    const parsed = JSON.parse(data.user_hackathon_extras);
                    if (Array.isArray(parsed)) {
                        extraValues = parsed.map((extra: { value?: string }) => extra.value || '').filter(Boolean);
                    }
                } catch (parseError) {
                    console.error(`❌ Failed to parse user_hackathon_extras for ${username}:`, parseError);
                }
            } else if (Array.isArray(data.user_hackathon_extras)) {
                extraValues = data.user_hackathon_extras.map((extra) => {
                    return extra.value || '';
                }).filter(Boolean);
            }
        }

        return {
            username: data.username,
            email: data.email || `${username}@example.com`,
            name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || username,
            hackathon_extras: extraValues,
            lastUpdated: new Date()
        };
    } catch (err) {
        console.error(`❌ Error fetching data for ${username}:`, err);
        return null;
    }
}

function validateParticipantData(info: ProcessedParticipant): boolean {
    if (!info.username || typeof info.username !== 'string') return false;
    if (!info.email || typeof info.email !== 'string') return false;
    if (!info.name || typeof info.name !== 'string') return false;
    if (!Array.isArray(info.hackathon_extras)) return false;
    
    return info.hackathon_extras.every(item => typeof item === 'string');
}

async function getSyncState(): Promise<SyncStateType> {
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
            { upsert: true, new: true }
        );
    } catch (err) {
        console.error('❌ Failed to update sync state:', err);
        throw err;
    }
}

async function processParticipants(
    participants: DevfolioParticipant[], 
    syncState: SyncStateType, 
    totalParticipants: number
) {
    const batchSize = 5;
    let processedCount = 0;
    let failedCount = 0;
    const failedUsernames: string[] = [];

    for (let i = 0; i < participants.length; i += batchSize) {
        const batch = participants.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (participant) => {
            const username = participant.user?.username;
            if (!username) return;

            try {
                const info = await fetchUserExtras(username);
                if (!info || !validateParticipantData(info)) {
                    failedCount++;
                    failedUsernames.push(username);
                    return;
                }

                await Participant.findOneAndUpdate(
                    { username },
                    { $set: info },
                    { upsert: true, new: true }
                );
                processedCount++;
            } catch (err) {
                failedCount++;
                failedUsernames.push(username);
            }
        }));

        // Update sync state periodically
        if (i % 25 === 0 || i === participants.length - 1) {
            await updateSyncState({
                ...syncState,
                lastProcessedIndex: i + batchSize,
                lastSyncTime: new Date(),
                totalParticipants,
                isActive: i < participants.length - 1
            });
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return NextResponse.json({
        processed: processedCount,
        failed: failedCount,
        failedUsernames,
        totalParticipants,
        message: `Processed ${processedCount} participants`
    });
}

export async function GET() {
    try {
        await dbConnect();

        const syncState = await getSyncState();
        
        if (syncState.isActive) {
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
            if (syncState.lastSyncTime < thirtyMinutesAgo) {
                console.log('⚠️ Sync was stuck, resetting...');
                await updateSyncState({ ...syncState, isActive: false });
            } else {
                return NextResponse.json({ message: 'Sync already in progress' }, { status: 409 });
            }
        }

        await updateSyncState({ ...syncState, isActive: true });

        const allParticipantsFromAPI = await fetchAllParticipantsFromAPI();
        const totalParticipants = allParticipantsFromAPI.length;

        const dbParticipants = await Participant.find({}, { username: 1 });
        const dbUsernames = new Set(dbParticipants.map(p => p.username));
        
        console.log(`📊 API Participants: ${totalParticipants}, DB Participants: ${dbUsernames.size}`);

        const missingParticipants = allParticipantsFromAPI.filter(
            (p: DevfolioParticipant) => !dbUsernames.has(p.user?.username)
        );

        if (missingParticipants.length === 0) {
            console.log('✅ All participants exist in DB, checking for updates...');
            
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const recentlyUpdated = await Participant.find({
                lastUpdated: { $lt: oneHourAgo }
            }).limit(100);
            
            if (recentlyUpdated.length === 0) {
                console.log('✅ All data is up to date');
                await updateSyncState({ 
                    ...syncState, 
                    isActive: false,
                    totalParticipants,
                    lastSyncTime: new Date() 
                });
                return NextResponse.json({ message: 'All data is synchronized' });
            }

            return await processParticipants(recentlyUpdated.map(p => ({ 
                user: { username: p.username } 
            })), syncState, totalParticipants);
        }

        console.log(`🔄 Found ${missingParticipants.length} missing participants`);
        return await processParticipants(missingParticipants, syncState, totalParticipants);

    } catch (err) {
        console.error('❌ Sync error:', err);
        const currentState = await getSyncState();
        await updateSyncState({ ...currentState, isActive: false });
        return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
    }
}