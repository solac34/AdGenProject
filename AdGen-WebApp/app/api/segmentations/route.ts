import { NextRequest } from 'next/server';
import { getFirestore } from '@/lib/firestore';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limitParam = parseInt(searchParams.get('limit') || '12', 10);
  const limit = Math.min(Math.max(isNaN(limitParam) ? 12 : limitParam, 1), 100);

  try {
    const db = getFirestore();
    const snap = await db
      .collection('user_activity_counts')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const items = (snap.docs || []).map((d: any) => {
      const data = (typeof d.data === 'function' ? d.data() : d.data) || {};
      // Firestore timestamp or ISO string
      let tsMs = Date.now();
      const createdAt = data.createdAt;
      if (createdAt && typeof createdAt.toDate === 'function') {
        tsMs = createdAt.toDate().getTime();
      } else if (typeof createdAt === 'string') {
        const parsed = Date.parse(createdAt);
        if (!isNaN(parsed)) tsMs = parsed;
      }
      const when = new Date(tsMs);
      const label = `${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      return {
        id: d.id,
        label,
        total_users: Number(data.total_users || 0),
        createdAtMs: tsMs,
      };
    });

    // reverse to ascending time for chart
    items.sort((a: any, b: any) => a.createdAtMs - b.createdAtMs);
    return Response.json({ items });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[segmentations GET]', e);
    return Response.json({ items: [] });
  }
}

