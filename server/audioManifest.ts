/**
 * server/audioManifest.ts
 *
 * Consolidated audio manifest for the ESP32 device.
 * The GET /api/device/audio-manifest endpoint returns this data so the
 * firmware can discover all available audio files and download them to SD.
 *
 * Categories:
 *   alarm_sounds   — alarm ringtones (WAV/MP3, short)
 *   meditation     — meditation/focus music tracks
 *   bom            — Book of Mormon full reading (60 multi-chapter sections)
 *   bible          — KJV Bible full reading (127 sections)
 *   bom_verses     — Individual BOM chapter clips (102 clips)
 *   bible_verses   — Individual Bible verse clips (192 clips)
 *   motivational   — Motivational speeches (52 tracks)
 *   affirmations   — Affirmation clips (190 tracks)
 *
 * Each entry:
 *   id       — stable identifier (used as SD filename base)
 *   title    — human-readable name shown on device
 *   url      — direct CDN URL for download
 *   category — one of the categories above
 *   meta     — optional extra fields (artist, book, sectionIndex, etc.)
 */

import { BOOK_OF_MORMON_SECTIONS } from '../app/data/spiritual-scriptures';
import { BIBLE_SECTIONS } from '../lib/bible-scriptures';
import { BIBLE_VERSES } from '../app/data/bible-verses';
import { BOM_VERSES } from '../app/data/bom-verses';
import { MOTIVATIONAL_SPEECHES } from '../app/data/motivational-speeches';
import { AFFIRMATIONS } from '../app/data/affirmations';

export interface AudioManifestEntry {
  id: string;
  title: string;
  url: string;
  category: string;
  /** SD card path relative to root, e.g. "bom/bom-01.mp3" — used by ESP32 firmware */
  filename: string;
  /** Alias for title — kept for ESP32 firmware backward compatibility */
  text: string;
  meta?: Record<string, string | number>;
}

export interface AudioManifest {
  version: number;
  generatedAt: string;
  totalFiles: number;
  categories: {
    id: string;
    label: string;
    count: number;
  }[];
  files: AudioManifestEntry[];
}

// ─── Static audio assets (CDN URLs are stable) ────────────────────────────────

const ALARM_SOUND_FILES: AudioManifestEntry[] = [
  { id: 'alarm_drumming',   title: 'Drumming',    url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_drumming_3dce95b9.wav',    category: 'alarm_sounds', filename: 'alarm_sounds/alarm_drumming.wav',    text: 'Drumming'    },
  { id: 'alarm_dubstep',    title: 'Dubstep',     url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_dubstep_c17cb2ab.wav',    category: 'alarm_sounds', filename: 'alarm_sounds/alarm_dubstep.wav',     text: 'Dubstep'     },
  { id: 'alarm_action',     title: 'Action',      url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_action_26f02017.wav',     category: 'alarm_sounds', filename: 'alarm_sounds/alarm_action.wav',      text: 'Action'      },
  { id: 'alarm_dynamic',    title: 'Dynamic',     url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_dynamic_1843ed92.wav',    category: 'alarm_sounds', filename: 'alarm_sounds/alarm_dynamic.wav',     text: 'Dynamic'     },
  { id: 'alarm_edm',        title: 'EDM House',   url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_edm_ce8fe03f.mp3',       category: 'alarm_sounds', filename: 'alarm_sounds/alarm_edm.mp3',         text: 'EDM House'   },
  { id: 'alarm_fulltrack',  title: 'Full Track',  url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_fulltrack_6082bd59.mp3',  category: 'alarm_sounds', filename: 'alarm_sounds/alarm_fulltrack.mp3',   text: 'Full Track'  },
  { id: 'alarm_prisonbell', title: 'Prison Bell', url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_prisonbell_9d68b4d6.mp3', category: 'alarm_sounds', filename: 'alarm_sounds/alarm_prisonbell.mp3',  text: 'Prison Bell' },
  { id: 'alarm_stomp4k',    title: 'Stomp 4K',    url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_stomp4k_be7c271e.mp3',    category: 'alarm_sounds', filename: 'alarm_sounds/alarm_stomp4k.mp3',     text: 'Stomp 4K'    },
  { id: 'alarm_stomp5k',    title: 'Stomp 5K',    url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_stomp5k_e7c316e0.mp3',    category: 'alarm_sounds', filename: 'alarm_sounds/alarm_stomp5k.mp3',     text: 'Stomp 5K'    },
  { id: 'alarm_sunny_end',  title: 'Sunny End',   url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_sunny_end_ff17c7ef.wav',  category: 'alarm_sounds', filename: 'alarm_sounds/alarm_sunny_end.wav',   text: 'Sunny End'   },
  { id: 'alarm_sunny_loop', title: 'Sunny Loop',  url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_sunny_loop_4c57ab59.wav', category: 'alarm_sounds', filename: 'alarm_sounds/alarm_sunny_loop.wav',  text: 'Sunny Loop'  },
  { id: 'med_bowl',         title: 'Meditation Bowl',  url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_bowl_c8bd7151.wav',      category: 'alarm_sounds', filename: 'alarm_sounds/med_bowl.wav',          text: 'Meditation Bowl'  },
  { id: 'med_breathing',    title: 'Breathwork',       url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_breathing_fd1069a2.wav', category: 'alarm_sounds', filename: 'alarm_sounds/med_breathing.wav',     text: 'Breathwork'       },
  { id: 'med_focus',        title: 'Focus',            url: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/meditation_focus_782acd2b.wav',     category: 'alarm_sounds', filename: 'alarm_sounds/med_focus.wav',         text: 'Focus'            },
];

const MEDITATION_AUDIO_FILES: AudioManifestEntry[] = [
  { id: 'med-1', title: 'Meditation',          url: 'https://cdn.pixabay.com/download/audio/2026/03/05/audio_37d75d2b63.mp3?filename=freemusicforvideo-meditation-495611.mp3',                                     category: 'meditation', filename: 'meditation/med-1.mp3', text: 'Meditation',          meta: { artist: 'FreeMusicForVideo', durationSec: 87  } },
  { id: 'med-2', title: 'Peaceful Zen Garden', url: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=please-calm-my-mind-125566.mp3',                                              category: 'meditation', filename: 'meditation/med-2.mp3', text: 'Peaceful Zen Garden', meta: { artist: 'Ambient Sounds',    durationSec: 180 } },
  { id: 'med-3', title: 'Deep Calm',           url: 'https://cdn.pixabay.com/download/audio/2024/11/04/audio_4956b4edd1.mp3?filename=meditation-music-432hz-deep-calm-mind-relaxation-276988.mp3',                 category: 'meditation', filename: 'meditation/med-3.mp3', text: 'Deep Calm', meta: { artist: 'Relaxation Music',  durationSec: 150 } },
  { id: 'med-4', title: 'Morning Mindset',     url: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=please-calm-my-mind-125566.mp3',                                              category: 'meditation', filename: 'meditation/med-4.mp3', text: 'Morning Mindset', meta: { artist: 'Mindful Start',     durationSec: 300 } },
  { id: 'med-5', title: 'Anxiety Release',     url: 'https://cdn.pixabay.com/download/audio/2024/11/04/audio_4956b4edd1.mp3?filename=meditation-music-432hz-deep-calm-mind-relaxation-276988.mp3',                 category: 'meditation', filename: 'meditation/med-5.mp3', text: 'Anxiety Release', meta: { artist: 'Calm Mind',         durationSec: 480 } },
  { id: 'med-6', title: 'Body Scan',           url: 'https://cdn.pixabay.com/download/audio/2024/11/04/audio_4956b4edd1.mp3?filename=meditation-music-432hz-deep-calm-mind-relaxation-276988.mp3',                 category: 'meditation', filename: 'meditation/med-6.mp3', text: 'Body Scan', meta: { artist: 'Deep Rest',         durationSec: 900 } },
  { id: 'med-7', title: 'Confidence Builder',  url: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=please-calm-my-mind-125566.mp3',                                              category: 'meditation', filename: 'meditation/med-7.mp3', text: 'Confidence Builder', meta: { artist: 'Inner Power',       durationSec: 360 } },
  { id: 'med-8', title: 'Anger Cooldown',      url: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=please-calm-my-mind-125566.mp3',                                              category: 'meditation', filename: 'meditation/med-8.mp3', text: 'Anger Cooldown', meta: { artist: 'Emotional Balance', durationSec: 240 } },
  { id: 'foc-1', title: 'Focus Flow',          url: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=please-calm-my-mind-125566.mp3',                                              category: 'meditation', filename: 'meditation/foc-1.mp3', text: 'Focus Flow', meta: { artist: 'Study Music',       durationSec: 180 } },
  { id: 'foc-2', title: 'Study Session',       url: 'https://cdn.pixabay.com/download/audio/2024/11/04/audio_4956b4edd1.mp3?filename=meditation-music-432hz-deep-calm-mind-relaxation-276988.mp3',                 category: 'meditation', filename: 'meditation/foc-2.mp3', text: 'Study Session', meta: { artist: 'Brain Waves',       durationSec: 300 } },
  { id: 'foc-3', title: 'Deep Focus',          url: 'https://cdn.pixabay.com/download/audio/2024/09/10/audio_6e5d7d1bab.mp3?filename=deep-meditation-192828.mp3',                                                  category: 'meditation', filename: 'meditation/foc-3.mp3', text: 'Deep Focus', meta: { artist: 'Concentration',     durationSec: 180 } },
];

// ─── Category labels ───────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  alarm_sounds: 'Alarm Sounds',
  meditation:   'Meditation & Focus',
  bom:          'Book of Mormon',
  bible:        'Bible (KJV)',
  bom_verses:   'BOM Verse Clips',
  bible_verses: 'Bible Verse Clips',
  motivational: 'Motivational Speeches',
  affirmations: 'Affirmations',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive the file extension from a URL (defaults to mp3). */
function extFromUrl(url: string): string {
  const clean = url.split('?')[0];
  const dot = clean.lastIndexOf('.');
  if (dot === -1) return 'mp3';
  const ext = clean.slice(dot + 1).toLowerCase();
  return ['mp3', 'wav', 'ogg', 'm4a'].includes(ext) ? ext : 'mp3';
}

/** Build the SD card path: "{category}/{id}.{ext}" */
function sdFilename(category: string, id: string, url: string): string {
  return `${category}/${id}.${extFromUrl(url)}`;
}

// ─── Build manifest ────────────────────────────────────────────────────────────

export function buildAudioManifest(): AudioManifest {
  const files: AudioManifestEntry[] = [];

  // Static files
  files.push(...ALARM_SOUND_FILES);
  files.push(...MEDITATION_AUDIO_FILES);

  // Book of Mormon sections (60) — real CDN URLs from data file
  for (const s of BOOK_OF_MORMON_SECTIONS) {
    const id = `bom-${String(s.id).padStart(2, '0')}`;
    files.push({
      id,
      title: s.title,
      url: s.url,
      category: 'bom',
      filename: sdFilename('bom', id, s.url),
      text: s.title,
      meta: { sectionIndex: s.id - 1 },
    });
  }

  // Bible sections (127) — real CDN URLs from data file
  for (let i = 0; i < BIBLE_SECTIONS.length; i++) {
    const s = BIBLE_SECTIONS[i];
    const id = `bible-${s.id}`;
    files.push({
      id,
      title: s.title,
      url: s.url,
      category: 'bible',
      filename: sdFilename('bible', id, s.url),
      text: s.title,
      meta: {
        book: s.book ?? '',
        sectionNum: s.sectionNum ?? i + 1,
      },
    });
  }

  // BOM verse clips (102)
  for (const v of BOM_VERSES) {
    const id = `bom-verse-${v.id}`;
    files.push({
      id,
      title: v.title,
      url: v.url,
      category: 'bom_verses',
      filename: sdFilename('bom_verses', id, v.url),
      text: v.title,
    });
  }

  // Bible verse clips (192)
  for (const v of BIBLE_VERSES) {
    const id = `bible-verse-${v.id}`;
    files.push({
      id,
      title: v.title,
      url: v.url,
      category: 'bible_verses',
      filename: sdFilename('bible_verses', id, v.url),
      text: v.title,
    });
  }

  // Motivational speeches (52)
  for (const s of MOTIVATIONAL_SPEECHES) {
    const id = `motivational-${s.id}`;
    files.push({
      id,
      title: s.title,
      url: s.url,
      category: 'motivational',
      filename: sdFilename('motivational', id, s.url),
      text: s.title,
      meta: { speechCategory: s.category ?? '' },
    });
  }

  // Affirmations (190)
  for (const a of AFFIRMATIONS) {
    const id = `affirmation-${a.id}`;
    const title = `${a.category} #${a.number}`;
    files.push({
      id,
      title,
      url: a.url,
      category: 'affirmations',
      filename: sdFilename('affirmations', id, a.url),
      text: title,
      meta: { affirmationCategory: a.category, chapter: a.chapter },
    });
  }

  // Build category summary
  const categoryCounts: Record<string, number> = {};
  for (const f of files) {
    categoryCounts[f.category] = (categoryCounts[f.category] ?? 0) + 1;
  }
  const categories = Object.entries(categoryCounts).map(([id, count]) => ({
    id,
    label: CATEGORY_LABELS[id] ?? id,
    count,
  }));

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    totalFiles: files.length,
    categories,
    files,
  };
}
