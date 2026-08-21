import { NextRequest, NextResponse } from 'next/server';
import { validateInitData } from '@/lib/telegram/validate';

/**
 * POST /api/auth/telegram
 * Validates Telegram Mini App initData and returns authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const { initData } = await request.json();

    if (!initData) {
      return NextResponse.json(
        { error: 'Missing initData' },
        { status: 400 }
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN not configured');
      return NextResponse.json(
        { error: 'Server misconfiguration' },
        { status: 500 }
      );
    }

    const result = validateInitData(initData, botToken);

    if (!result.valid) {
      return NextResponse.json(
        { error: result.error },
        { status: 401 }
      );
    }

    // Return validated user + session token for subsequent requests
    return NextResponse.json({
      user: result.user,
      authenticated: true,
    });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
