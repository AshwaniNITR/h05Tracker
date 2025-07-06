import { NextResponse } from 'next/server';

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

export async function GET() {
    try {
        const allParticipants: Array<{
            username: string;
            first_name?: string;
            last_name?: string;
        }> = [];
        let page = 1;
        const limit = 200;
        let totalCount = 0;

        while (true) {
            const response = await fetch(`https://api.devfolio.co/api/hackathons/hackodisha-4/participants?${new URLSearchParams({
                limit: limit.toString(),
                page: page.toString(),
                order: 'DESC',
                role: 'hacker',
                user:'eyJzdGF0dXMiOiJhY3RpdmUifQ%3D%3D',
                status: 'accept_sent%2Caccept%2Ccheck_in%2Creimburse%2Creject_sent%2Creject%2Crsvp%2Csubmit%2Cwaitlist_sent%2Cwaitlist%2Cwithdraw'
            })}`, { headers });

            const data: { result: DevfolioParticipant[] } = await response.json();
            const participants = data.result;
            
            if (!participants.length) break;

            // Extract the required fields from each participant
            const extractedParticipants = participants.map(p => ({
                username: p.user.username,
                first_name: p.user.first_name,
                last_name: p.user.last_name
            }));

            allParticipants.push(...extractedParticipants);
            totalCount += participants.length;
            page++;
        }

        return NextResponse.json({ 
            success: true,
            count: totalCount,
            participants: allParticipants
        });
    } catch (err) {
        console.error('❌ Error fetching participants:', err);
        return NextResponse.json({ 
            error: 'Failed to fetch participants.',
            details: err instanceof Error ? err.message : String(err)
        }, { status: 500 });
    }
}