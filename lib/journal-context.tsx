/**
 * Journal Context — provides shared journal state to all sub-tabs.
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import {
  JournalEntry,
  loadEntries,
  saveEntries,
  addEntry as addEntryToStore,
  updateEntry as updateEntryInStore,
  deleteEntry as deleteEntryFromStore,
} from "./journal-store";
import { getLastUserId } from "./storage";

interface JournalContextValue {
  entries: JournalEntry[];
  loading: boolean;
  userId: string;
  refresh: () => Promise<void>;
  addEntry: (entry: JournalEntry) => Promise<void>;
  updateEntry: (entryId: string, updates: Partial<JournalEntry>) => Promise<void>;
  deleteEntry: (entryId: string) => Promise<void>;
  /** Currently selected date for calendar navigation */
  selectedDate: string | null;
  setSelectedDate: (date: string | null) => void;
  /** Open the entry editor */
  editingEntry: JournalEntry | null;
  setEditingEntry: (entry: JournalEntry | null) => void;
  /** Show new entry editor */
  showNewEntry: boolean;
  setShowNewEntry: (show: boolean) => void;
  /** Pre-fill date for new entry from calendar */
  newEntryDate: string | null;
  setNewEntryDate: (date: string | null) => void;
}

const JournalContext = createContext<JournalContextValue | null>(null);

export function JournalProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [newEntryDate, setNewEntryDate] = useState<string | null>(null);
  const initialised = useRef(false);

  const refresh = useCallback(async () => {
    const uid = await getLastUserId();
    if (!uid) return;
    setUserId(uid);
    const loaded = await loadEntries(uid);
    // Sort newest first
    loaded.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setEntries(loaded);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      refresh();
    }
  }, [refresh]);

  const handleAddEntry = useCallback(async (entry: JournalEntry) => {
    const uid = await getLastUserId();
    if (!uid) return;
    const updated = await addEntryToStore(uid, entry);
    updated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setEntries(updated);
  }, []);

  const handleUpdateEntry = useCallback(async (entryId: string, updates: Partial<JournalEntry>) => {
    const uid = await getLastUserId();
    if (!uid) return;
    const updated = await updateEntryInStore(uid, entryId, updates);
    updated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setEntries(updated);
  }, []);

  const handleDeleteEntry = useCallback(async (entryId: string) => {
    const uid = await getLastUserId();
    if (!uid) return;
    const updated = await deleteEntryFromStore(uid, entryId);
    updated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setEntries(updated);
  }, []);

  return (
    <JournalContext.Provider
      value={{
        entries,
        loading,
        userId,
        refresh,
        addEntry: handleAddEntry,
        updateEntry: handleUpdateEntry,
        deleteEntry: handleDeleteEntry,
        selectedDate,
        setSelectedDate,
        editingEntry,
        setEditingEntry,
        showNewEntry,
        setShowNewEntry,
        newEntryDate,
        setNewEntryDate,
      }}
    >
      {children}
    </JournalContext.Provider>
  );
}

export function useJournal() {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error("useJournal must be used within JournalProvider");
  return ctx;
}
