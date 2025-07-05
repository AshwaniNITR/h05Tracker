import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Participant from '@/models/Participant';

export async function GET(request: Request) {
  await dbConnect();

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const searchConditions = query ? {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { username: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { hackathon_extras: { $regex: query, $options: 'i' } }
      ]
    } : {};

    const participants = await Participant.find(searchConditions)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Participant.countDocuments(searchConditions);

    return NextResponse.json({ 
      success: true, 
      data: participants,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Data fetch error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch participant data' },
      { status: 500 }
    );
  }
}