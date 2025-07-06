// Create this file as: /api/participants/reset/route.ts
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { SyncState } from '@/models/Participant';

export async function POST() {
    await dbConnect();

    try {
        const hackathonId = 'hackodisha-4';
        
        // Reset the sync state
        await SyncState.findOneAndUpdate(
            { hackathonId },
            { 
                $set: {
                    isActive: false,
                    lastSyncTime: new Date()
                }
            },
            { upsert: true }
        );

        return NextResponse.json({
            success: true,
            message: 'Sync state reset successfully',
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('❌ Reset error:', err);
        return NextResponse.json(
            { 
                error: 'Failed to reset sync state', 
                details: err instanceof Error ? err.message : String(err) 
            },
            { status: 500 }
        );
    }
}

// Optional: GET to check current sync state
export async function GET() {
    await dbConnect();

    try {
        const hackathonId = 'hackodisha-4';
        const state = await SyncState.findOne({ hackathonId });

        return NextResponse.json({
            success: true,
            syncState: state || 'No sync state found',
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('❌ Get sync state error:', err);
        return NextResponse.json(
            { 
                error: 'Failed to get sync state', 
                details: err instanceof Error ? err.message : String(err) 
            },
            { status: 500 }
        );
    }
}