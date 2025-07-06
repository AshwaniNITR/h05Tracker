import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Participant from '@/models/Participant';

const headers = {
    'cookie': process.env.DEVFOLIO_COOKIE || 'your-cookie-here', // Ensure this matches your Express cookie
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
            next: { revalidate: 60 } // Cache for 60 seconds
        });

        if (!res.ok) throw new Error(`API request failed with status ${res.status}`);
        
        const data: DevfolioExtras = await res.json();
        const extraValues = data.user_hackathon_extras?.map((e) => e.value) || [];

        return {
            username: data.username,
            email: data.email,
            name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim(),
            hackathon_extras: extraValues,
            updatedAt: new Date()
        };
    } catch (err) {
        console.error(`❌ Error for ${username}:`, err);
        return null;
    }
}

export async function GET() {
    await dbConnect();

    try {
        const allParticipants = [];
        let page = 1;
        const limit = 200;
        let totalProcessed = 0;

        while (true) {
            const params = new URLSearchParams({
                limit: limit.toString(),
                page: page.toString(),
                order: 'DESC',
                role: 'hacker',
                status: 'submit', // Changed to match Express version
                user: 'eyJzdGF0dXMiOiJhY3RpdmUifQ%3D%3D'
            });

            const response = await fetch(`https://api.devfolio.co/api/hackathons/hackodisha-4/participants?${params}`, { 
                headers,
                next: { revalidate: 60 } // Cache for 60 seconds
            });

            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const data: { result: DevfolioParticipant[] } = await response.json();
            const participants = data.result;
            
            if (!participants || participants.length === 0) break;

            // Process participants in parallel for better performance
            const processingPromises = participants.map(async (p) => {
                const username = p?.user?.username;
                if (!username) return null;

                // Check if participant exists in DB
                const exists = await Participant.findOne({ username });
                if (exists) return null;

                const info = await fetchUserExtras(username);
                if (!info) return null;

                // Upsert to MongoDB (update if exists, insert if not)
                await Participant.findOneAndUpdate(
                    { username },
                    { $set: info },
                    { upsert: true, new: true }
                );

                return info;
            });

            const results = await Promise.all(processingPromises);
            const successfulAdds = results.filter(Boolean);
            allParticipants.push(...successfulAdds);
            totalProcessed += successfulAdds.length;

            console.log(`Processed page ${page}: ${successfulAdds.length} new participants`);
            
            page++;

            // Safety break to prevent infinite loops
            if (page > 20) break;
        }

        const totalInDB = await Participant.countDocuments();

        return NextResponse.json({ 
            success: true,
            newParticipants: allParticipants.length,
            totalProcessed,
            totalInDB,
            participants: allParticipants.slice(0, 10) // Sample of first 10 for verification
        });
    } catch (err) {
        console.error('❌ Main fetch error:', err);
        return NextResponse.json({ 
            error: 'Failed to fetch participants.',
            message: err instanceof Error ? err.message : 'Unknown error',
            stack: process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.stack : undefined) : undefined
        }, { status: 500 });
    }
}