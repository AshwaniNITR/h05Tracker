import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Participant from '@/models/Participant';

const headers = {
    'cookie': process.env.DEVFOLIO_COOKIE || '',
    'User-Agent': 'Mozilla/5.0',
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
        const res = await fetch(`https://api.devfolio.co/api/hackathons/hackodisha-4/participants/${username}?${new URLSearchParams({
            hackathon_scope_extra_attributes: 'uuid,name,required,desc,type',
            profile_attributes: 'name',
            user_attributes: 'first_name,last_name,username,dob,email,uuid,bio,short_bio,status',
            user_extra_attributes: 'resume',
            user_hackathon_attributes: 'uuid,status,ticket,note,ai_assisted_score,ai_assisted_status,ai_assisted_reason',
            user_hackathon_extra_attributes: 'uuid,value'
        })}`, { headers });

        const data: DevfolioExtras = await res.json();
        const extraValues = data.user_hackathon_extras?.map((e) => e.value) || [];

        return {
            username: data.username,
            email: data.email,
            name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim(),
            hackathon_extras: extraValues
        };
    } catch (err) {
        console.error(`❌ Error for ${username}:`, err);
        return null;
    }
}

export async function GET() {
    await dbConnect();

    try {
        const allParticipants: Array<{
            username: string;
            email?: string;
            name: string;
            hackathon_extras: string[];
        }> = [];
        let page = 1;
        const limit = 200;

        while (true) {
            const response = await fetch(`https://api.devfolio.co/api/hackathons/hackodisha-4/participants?${new URLSearchParams({
                limit: limit.toString(),
                page: page.toString(),
                order: 'DESC',
                role: 'hacker',
                status: 'submit'
            })}`, { headers });

            const data: { result: DevfolioParticipant[] } = await response.json();
            const participants = data.result;
            if (!participants.length) break;

            // Find existing usernames in DB
            const usernames = participants.map((p) => p?.user?.username).filter(Boolean) as string[];
            const existingParticipants = await Participant.find({
                username: { $in: usernames }
            });
            const existingUsernames = new Set(existingParticipants.map((p: { username: string }) => p.username));

            for (const p of participants) {
                const username = p?.user?.username;
                if (username && !existingUsernames.has(username)) {
                    const info = await fetchUserExtras(username);
                    if (info) {
                        // Save to MongoDB
                        const newParticipant = new Participant(info);
                        await newParticipant.save();
                        allParticipants.push(info);
                    }
                }
            }

            page++;
        }

        return NextResponse.json({ 
            success: true, 
            message: `Updated ${allParticipants.length} new participants`,
            totalParticipants: await Participant.countDocuments() 
        });
    } catch (err) {
        console.error('❌ Main fetch error:', err);
        return NextResponse.json({ error: 'Failed to fetch participants.' }, { status: 500 });
    }
}