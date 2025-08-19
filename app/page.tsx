'use client';

import React, { useMemo, useRef, useState, useEffect } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Sparkles, ThumbsUp, ThumbsDown, Calendar as CalendarIcon, Clock, MapPin, CheckCheck, X, ChevronLeft, ChevronRight, Link as LinkIcon, Edit } from "lucide-react";

// shadcn/ui imports (assumed available in the project)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

// Google Maps Places (client-side)
import { Autocomplete, useJsApiLoader } from "@react-google-maps/api";

// -----------------------------------------------------------------------------
// TYPES (UI-only for now; wire to real schemas later)
// -----------------------------------------------------------------------------

type PlaceLink = {
  name: string;
  gmapsUrl: string; // deep link to Google Maps
};

type Idea = {
  id: string;
  source: "manual" | "ai";
  title: string;
  description?: string;
  place?: PlaceLink;
  tags?: string[];
};

type Suggestion = {
  id: string;
  ideaId: string;
  start: string; // ISO
  end: string;   // ISO
  // optional overrides (if later you allow editing in the suggest modal)
  title?: string;
  description?: string;
  place?: PlaceLink;
  votes: Record<string, "up" | "down" | undefined>; // partnerId -> vote
  status: "pending" | "accepted" | "cancelled";
};

// Event now only references the suggestion — no duplicated title/place/datetime
// All render-time details come from the linked Suggestion (and its Idea)
// → minimal source of truth, no repeated data.
type EventItem = {
  id: string;
  suggestionId: string;
};

// Dummy partners (bearer-lite for UI)
const PARTNERS = [
  { id: "A", name: "Artem" },
  { id: "B", name: "Eli" },
];

// DEPRECATED: seed ideas
// The inline `seedIdeas` array was used for local UI prototyping. It is
// intentionally retained here for reference only and should not be used at
// runtime. New installations should load ideas from the server via
// `/api/ideas`. The application now initializes `ideas` to an empty array.
// NOTE: safe to remove this block once you no longer need the example data.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const seedIdeas: Idea[] = [
  { id: "i1", source: "manual", title: "Sunset picnic by the river", tags: ["outdoor", "sunset"], place: { name: "Riverside Park", gmapsUrl: "https://www.google.com/maps/search/?api=1&query=Riverside%20Park" } },
  { id: "i2", source: "ai", title: "Film photo mini-mission", tags: ["creative", "city"], description: "36 shots challenge around the old town." },
  { id: "i3", source: "ai", title: "Board-game & bánh mì night", tags: ["cozy", "indoors"], place: { name: "At home", gmapsUrl: "https://www.google.com/maps" } },
];

// Utils
const uid = () => Math.random().toString(36).slice(2, 10);
const isoDayKey = (d: Date) => format(d, "yyyy-MM-dd");

// Build a Google Maps deep link from a PlaceResult
function placeToLink(place: google.maps.places.PlaceResult): PlaceLink | undefined {
  const name = place.name || place.formatted_address || "Location";
  const url = place.url || (place.place_id ? `https://www.google.com/maps/search/?api=1&query_place_id=${place.place_id}` : undefined);
  if (!url) return undefined;
  return { name, gmapsUrl: url };
}

// Helpers to resolve graph
const findSuggestion = (suggestions: Suggestion[], id: string) => suggestions.find(s => s.id === id);
const findIdea = (ideas: Idea[], id?: string) => ideas.find(i => i.id === id);

// Derive display fields for a suggestion+idea pair
function getDisplayForSuggestion(s: Suggestion, idea?: Idea) {
  const title = s.title ?? idea?.title ?? "(Idea)";
  const description = s.description ?? idea?.description;
  const place = s.place ?? idea?.place;
  const start = s.start;
  const end = s.end;
  return { title, description, place, start, end };
}

// -----------------------------------------------------------------------------
// COMPONENT: LocationPicker
// -----------------------------------------------------------------------------

function LocationPicker({ value, onChange, placeholder = "Search place" }: {
  value?: PlaceLink;
  onChange: (p?: PlaceLink) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: ["places"],
  });

  const handlePlace = () => {
    if (!acRef.current) return;
    const place = acRef.current.getPlace();
    const link = placeToLink(place);
    onChange(link);
    if (inputRef.current && link) inputRef.current.value = link.name;
  };

  return (
    <div className="flex items-center gap-2">
      {isLoaded ? (
        <Autocomplete
          onLoad={(ac) => (acRef.current = ac)}
          onPlaceChanged={handlePlace}
          options={{ fields: ["name", "place_id", "formatted_address", "url"], strictBounds: false }}
        >
          <Input ref={inputRef} placeholder={placeholder} defaultValue={value?.name ?? ""} />
        </Autocomplete>
      ) : (
        <Input placeholder="Loading Google Maps…" disabled />
      )}
      {value?.gmapsUrl && (
        <a href={value.gmapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline">
          <LinkIcon className="h-4 w-4"/> Open
        </a>
      )}
      {value && (
        <Button variant="ghost" size="icon" onClick={() => onChange(undefined)} title="Clear">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// COMPONENT: MonthCalendar
// -----------------------------------------------------------------------------

function MonthCalendar({ currentMonth, setCurrentMonth, events, suggestions, ideas, onEventClick }: {
  currentMonth: Date;
  setCurrentMonth: (d: Date) => void;
  events: EventItem[];
  suggestions: Suggestion[];
  ideas: Idea[];
  onSelectDay?: (d: Date) => void;
  onEventClick?: (e: EventItem) => void;
}) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let day = startDate;
  while (day <= endDate) { days.push(day); day = addDays(day, 1); }

  // Expand events → attach their suggestion & idea to compute day buckets without copying data
  const expanded = useMemo(() => {
    return events.map((ev) => {
      const s = findSuggestion(suggestions, ev.suggestionId);
      const i = findIdea(ideas, s?.ideaId);
      if (!s) return null;
      const info = getDisplayForSuggestion(s, i);
      return { ev, s, i, info } as const;
    }).filter(Boolean) as Array<{ ev: EventItem; s: Suggestion; i?: Idea; info: ReturnType<typeof getDisplayForSuggestion> }>;
  }, [events, suggestions, ideas]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, typeof expanded>();
    for (const item of expanded) {
      const key = isoDayKey(parseISO(item.info.start));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [expanded]);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <CalendarIcon className="h-5 w-5" />
          <CardTitle className="text-xl">Shared Calendar</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-5 w-5" /></Button>
          <div className="min-w-[10ch] text-center font-medium">{format(currentMonth, "MMMM yyyy")}</div>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-5 w-5" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 text-xs font-semibold text-muted-foreground mb-2">
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (<div className="px-2 py-1" key={d}>{d}</div>))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const key = isoDayKey(d);
            const dayEvents = eventsByDay.get(key) || [];
            const faded = !isSameMonth(d, currentMonth);
            return (
              <div key={key} className={`min-h-[86px] rounded-2xl border p-2 transition hover:shadow-sm ${faded ? "opacity-40" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className={`text-xs ${isSameDay(d, new Date()) ? "font-bold" : ""}`}>{format(d, "d")}</div>
                </div>
                <div className="mt-1 flex flex-col gap-1">
                  <AnimatePresence initial={false}>
                    {dayEvents.slice(0,3).map(({ ev, info }) => (
                      <motion.button
                        key={ev.id}
                        type="button"
                        onClick={() => onEventClick?.(ev)}
                        className="text-left truncate rounded-md bg-primary/10 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        title={`${info.title} • ${format(parseISO(info.start), "HH:mm")}–${format(parseISO(info.end), "HH:mm")}`}
                      >
                        {info.title}
                      </motion.button>
                    ))}
                    {dayEvents.length > 3 && (<div className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more…</div>)}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// COMPONENT: IdeaCard (shared between suggestions & upcoming)
// -----------------------------------------------------------------------------

function IdeaCard({ suggestion, idea, partnerVote, acceptSuggestion, onEditIdea, onEditSuggestion }: {
  suggestion: Suggestion;
  idea?: Idea;
  partnerVote?: (sid: string, partnerId: string, vote: "up" | "down") => void;
  acceptSuggestion?: (sid: string) => void;
  onEditIdea?: (ideaId: string) => void;
  onEditSuggestion?: (suggestionId: string) => void;
}) {
  const upCount = Object.values(suggestion.votes).filter((v) => v === "up").length;
  const downCount = Object.values(suggestion.votes).filter((v) => v === "down").length;
  const info = getDisplayForSuggestion(suggestion, idea);

  return (
    <motion.div
      key={suggestion.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border p-3"
    >
      <div className="flex items-start justify-between gap-3">
        {/* left: idea & meta */}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium truncate">{info.title}</div>
            {idea && onEditIdea && (
              <Button size="sm" variant="ghost" className="ml-2" onClick={() => onEditIdea(idea.id)}>
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </div>
          {info.description && (
            <div className="text-sm text-muted-foreground mt-1">{info.description}</div>
          )}
          <div className="text-xs text-muted-foreground mt-1 flex flex-col gap-1">
            {/* row 1: date/time */}
            <div className="flex items-center gap-2 flex-wrap">
              <CalendarIcon className="h-3.5 w-3.5" />
              {format(parseISO(info.start), "EEE, MMM d • HH:mm")} – {format(parseISO(info.end), "HH:mm")}
            </div>

            {/* row 2: place (if any) */}
            {info.place && (
              <a href={info.place.gmapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {info.place.name}
              </a>
            )}
          </div>
        </div>

        {/* right: stacked partner votes + accept row (only shown in suggestions list) */}
        {acceptSuggestion && partnerVote && (
          <div className="w-36 shrink-0 flex flex-col gap-1">
            {/* partner votes (one row per partner) */}
            <div className="flex flex-col gap-2">
              {PARTNERS.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-1">
                  <div className="text-xs text-muted-foreground">{p.name ?? `Partner ${p.id}`}</div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" className="w-9" variant={suggestion.votes[p.id] === "up" ? "default" : "outline"} onClick={() => partnerVote(suggestion.id, p.id, "up")} aria-pressed={suggestion.votes[p.id] === "up"} aria-label={`Thumbs up by ${p.name ?? p.id}`}>
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button size="sm" className="w-9" variant={suggestion.votes[p.id] === "down" ? "destructive" : "outline"} onClick={() => partnerVote(suggestion.id, p.id, "down")} aria-pressed={suggestion.votes[p.id] === "down"} aria-label={`Thumbs down by ${p.name ?? p.id}`}>
                      <ThumbsDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* edit suggestion button */}
            <div className="pt-2 flex gap-2">
              <Button size="sm" variant="ghost" className="w-full" onClick={() => onEditSuggestion?.(suggestion.id)}>
                <Edit className="mr-2 h-4 w-4" /> Edit
              </Button>
            </div>

            {/* accept row (full-width button) */}
            <div className="pt-2 border-t">
              <Button size="sm" className="w-full" onClick={() => acceptSuggestion(suggestion.id)}>
                <CheckCheck className="mr-2 h-4 w-4" /> Accept
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        Votes: <span className="text-foreground">{upCount}</span> up / {downCount} down
      </div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// COMPONENT: IdeasPanel
// -----------------------------------------------------------------------------


function IdeasPanel({ ideas, onAddManual, onLoadAiIdeas, onOpenSuggest, manualTitle, setManualTitle, manualDescription, setManualDescription, manualPlace, setManualPlace, selectedDayISO, onEditIdea }: {
  ideas: Idea[];
  onAddManual: () => void;
  onLoadAiIdeas: () => void;
  onOpenSuggest: (ideaId: string, dateIso?: string) => void;
  manualTitle: string;
  setManualTitle: (s: string) => void;
  manualDescription: string;
  setManualDescription: (s: string) => void;
  manualPlace?: PlaceLink;
  setManualPlace: (p?: PlaceLink) => void;
  selectedDayISO: string | null;
  onEditIdea?: (ideaId: string) => void;
}) {
  return (
    <Card className="xl:col-span-1">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">Date Ideas</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onLoadAiIdeas}>
              <Sparkles className="mr-2 h-4 w-4" /> AI picks
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="list">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">All ideas</TabsTrigger>
            <TabsTrigger value="add">Add manual</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="mt-3">
            <div className="flex flex-col gap-3">
              {ideas.map((idea) => (
                <motion.div key={idea.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className="rounded-2xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{idea.title}</div>
                      {idea.description && <div className="text-sm text-muted-foreground mt-1">{idea.description}</div>}
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {idea.place && (
                          <a href={idea.place.gmapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
                            <Badge variant="secondary" className="flex items-center gap-1"><MapPin className="h-3 w-3"/>{idea.place.name}</Badge>
                          </a>
                        )}
                        {idea.tags?.map(t => <Badge key={t} variant="outline">{t}</Badge>)}
                        <Badge variant={idea.source === "ai" ? "default" : "outline"} className="ml-auto">{idea.source.toUpperCase()}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => onOpenSuggest(idea.id, selectedDayISO ?? format(new Date(), "yyyy-MM-dd"))}>
                        <Clock className="mr-2 h-4 w-4"/> Suggest
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onEditIdea?.(idea.id)} title="Edit idea">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="add" className="mt-3">
            <div className="grid gap-3">
              <Label>Title</Label>
              <Input value={manualTitle} onChange={(e)=>setManualTitle(e.target.value)} placeholder="E.g., Lantern-lit night walk"/>
              <Label>Description</Label>
              <Textarea value={manualDescription} onChange={(e)=>setManualDescription(e.target.value)} placeholder="Optional details"/>
              <Label>Location (Google Maps)</Label>
              <LocationPicker value={manualPlace} onChange={setManualPlace} />
              <div className="flex justify-end">
                <Button onClick={onAddManual}><Plus className="mr-2 h-4 w-4"/>Add idea</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// COMPONENT: SuggestionsPanel
// -----------------------------------------------------------------------------

function SuggestionsPanel({ ideas, pendingSuggestions, partnerVote, acceptSuggestion, selectedDateLabel, openSuggest, setOpenSuggest, form, setForm, createSuggestion, onEditIdea, onEditSuggestion }: {
  ideas: Idea[];
  pendingSuggestions: Suggestion[];
  partnerVote: (sid: string, partnerId: string, vote: "up" | "down") => void;
  acceptSuggestion: (sid: string) => void;
  selectedDateLabel: string;
  openSuggest: boolean;
  setOpenSuggest: (b: boolean) => void;
  form: { ideaId: string; date: string; startTime: string; endTime: string; place?: PlaceLink };
  setForm: (f: { ideaId: string; date: string; startTime: string; endTime: string; place?: PlaceLink }) => void;
  createSuggestion: () => void;
  onEditIdea?: (ideaId: string) => void;
  onEditSuggestion?: (suggestionId: string) => void;
}) {
  return (
    <Card className="xl:col-span-1">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">Suggestions & Voting</CardTitle>

          <Dialog open={openSuggest} onOpenChange={setOpenSuggest}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" /> Suggest timeslot
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Propose a date</DialogTitle>
              </DialogHeader>

              <div className="grid gap-3">
                <Label htmlFor="suggest-idea">Idea</Label>
                <select
                  id="suggest-idea"
                  className="w-full rounded-md border bg-background p-2"
                  value={form.ideaId}
                  onChange={(e) => setForm({ ...form, ideaId: e.target.value })}
                >
                  <option value="" disabled>
                    Pick an idea…
                  </option>
                  {ideas.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Start</Label>
                      <Input
                        type="time"
                        value={form.startTime}
                        onChange={(e) =>
                          setForm({ ...form, startTime: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>End</Label>
                      <Input
                        type="time"
                        value={form.endTime}
                        onChange={(e) =>
                          setForm({ ...form, endTime: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                <Separator className="my-2" />

                <Label>Location (Google Maps)</Label>
                <LocationPicker
                  value={form.place}
                  onChange={(p) => setForm({ ...form, place: p })}
                />
              </div>

              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setOpenSuggest(false)}>
                  Cancel
                </Button>
                <Button onClick={createSuggestion}>Create suggestion</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
          <div>Pending suggestions ({pendingSuggestions.length})</div>
          <div>
            Selected day: <span className="font-medium">{selectedDateLabel}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {pendingSuggestions.length === 0 && (
            <div className="rounded-2xl border p-4 text-sm text-muted-foreground">
              No suggestions yet. Pick an idea → Suggest timeslot.
            </div>
          )}

          {pendingSuggestions.map((s) => {
            const idea = findIdea(ideas, s.ideaId);
            return (
              <IdeaCard
                key={s.id}
                suggestion={s}
                idea={idea}
                partnerVote={partnerVote}
                acceptSuggestion={acceptSuggestion}
                onEditIdea={onEditIdea}
                onEditSuggestion={onEditSuggestion}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// COMPONENT: UpcomingList
// -----------------------------------------------------------------------------

function UpcomingList({ ideas, suggestions, events }: { ideas: Idea[]; suggestions: Suggestion[]; events: EventItem[] }) {
  // Expand events into their suggestion + idea for display
  const expanded = useMemo(() => {
    return events.map((ev) => {
      const s = findSuggestion(suggestions, ev.suggestionId);
      const i = findIdea(ideas, s?.ideaId);
      if (!s) return null;
      return { ev, s, i } as const;
    }).filter(Boolean) as Array<{ ev: EventItem; s: Suggestion; i?: Idea }>;
  }, [events, suggestions, ideas]);

  const upcoming = expanded
    .filter(({ s }) => parseISO(s.start).getTime() >= Date.now())
    .sort((a,b) => parseISO(a.s.start).getTime() - parseISO(b.s.start).getTime())
    .slice(0,5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Upcoming (next 7 days)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {upcoming.map(({ ev, s, i }) => (
          <IdeaCard key={ev.id} suggestion={s} idea={i} />
        ))}
        {upcoming.length === 0 && (
          <div className="text-sm text-muted-foreground">No upcoming events.</div>
        )}
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// MAIN COMPOSITION: PartnershipCalendarUI
// -----------------------------------------------------------------------------

export default function PartnershipCalendarUI() {
  // IDEAS
  // Start with an empty list; ideas are loaded from the server on mount.
  // The legacy `seedIdeas` constant above is kept for reference only.
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualPlace, setManualPlace] = useState<PlaceLink | undefined>(undefined);

  // SUGGESTIONS / EVENTS (loaded from API)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  // Debug: last fetch error for initial load
  const [lastFetchError, setLastFetchError] = useState<string | null>(null);

  // Load initial data from API
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const fetchJson = async (url: string) => {
          const r = await fetch(url);
          let body: unknown;
          try {
            body = await r.json();
          } catch (err) {
            const text = await r.text();
            console.error('Failed to parse JSON from', url, 'responseText=', text);
            throw err;
          }
          if (!r.ok) console.error('Fetch failed', url, 'status=', r.status, 'body=', body);
          return body;
        };

        const [ideasRes, suggRes, evRes] = await Promise.all([
          fetchJson('/api/ideas'),
          fetchJson('/api/suggestions'),
          fetchJson('/api/events'),
        ]);

        if (!mounted) return;

        // normalize ideas
        if (Array.isArray(ideasRes)) {
          setIdeas(ideasRes.map((i: unknown) => {
            const it = i as unknown as Record<string, unknown>;
            return { id: it.id ?? it._id, source: it.source ?? 'manual', title: it.title, description: it.description, place: it.location ? { name: it.location, gmapsUrl: it.location } : undefined, tags: it.tags } as Idea;
          }));
        } else {
          console.warn('Ideas response is not an array', ideasRes);
        }

        // normalize suggestions (map startUtc/endUtc)
        if (Array.isArray(suggRes)) {
          setSuggestions(suggRes.map((s: unknown) => {
            const ss = s as unknown as Record<string, unknown>;
            return { id: ss.id ?? ss._id, ideaId: ss.ideaId, start: ss.startUtc ?? ss.start, end: ss.endUtc ?? ss.end, title: ss.titleOverride ?? ss.title, description: ss.descriptionOverride ?? ss.description, place: ss.locationOverride ? { name: ss.locationOverride, gmapsUrl: ss.locationOverride } : undefined, votes: ss.votes ?? {}, status: ss.status ?? 'pending' } as Suggestion;
          }));
        } else {
          console.warn('Suggestions response is not an array', suggRes);
        }

        // normalize events
        if (Array.isArray(evRes)) {
          setEvents(evRes.map((e: unknown) => {
            const ee = e as unknown as Record<string, unknown>;
            return { id: ee.id ?? ee._id ?? ee.uid ?? uid(), suggestionId: ee.suggestionId } as EventItem;
          }));
        } else {
          console.warn('Events response is not an array', evRes);
        }
      } catch (err) {
        console.error('Failed to load data', err);
        setLastFetchError(String(err ?? 'unknown'));
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  // Calendar
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDayISO, setSelectedDayISO] = useState<string | null>(null);

  // Suggest Modal
  const suggestedTimeRange = getDefaultTimeRange();

  const [openSuggest, setOpenSuggest] = useState(false);
  const [form, setForm] = useState({ ideaId: "", date: format(new Date(), "yyyy-MM-dd"), startTime: suggestedTimeRange.start, endTime: suggestedTimeRange.end } as { ideaId: string; date: string; startTime: string; endTime: string; place?: PlaceLink });

  // Edit Idea modal
  const [editIdeaOpen, setEditIdeaOpen] = useState(false);
  const [editIdeaId, setEditIdeaId] = useState<string | null>(null);
  const [editIdeaForm, setEditIdeaForm] = useState({ title: "", description: "", place: undefined as PlaceLink | undefined });

  // Edit Suggestion modal
  const [editSuggestionOpen, setEditSuggestionOpen] = useState(false);
  const [editSuggestionId, setEditSuggestionId] = useState<string | null>(null);
  const [editSuggestionForm, setEditSuggestionForm] = useState({ ideaId: "", date: format(new Date(), "yyyy-MM-dd"), startTime: "18:00", endTime: "20:00", title: "", description: "", place: undefined as PlaceLink | undefined });

  const selectedDateLabel = selectedDayISO ? format(parseISO(selectedDayISO), "EEE, MMM d") : "Pick a day";

  // Handlers
  const addManualIdea = () => {
    if (!manualTitle.trim()) return;
    (async ()=>{
      try{
        const payload = { source: 'manual', title: manualTitle.trim(), description: manualDescription.trim() || undefined, location: manualPlace?.name };
        const res = await fetch('/api/ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const created = await res.json();
        const idea: Idea = { id: created.id ?? created._id, source: created.source ?? 'manual', title: created.title, description: created.description, place: created.location ? { name: created.location, gmapsUrl: created.location } : undefined };
        setIdeas((prev) => [idea, ...prev]);
        setManualTitle(""); setManualDescription(""); setManualPlace(undefined);
      }catch(e){console.error(e)}
    })();
  };

  const loadAiIdeas = () => {
    const pool = [
      { source: 'ai', title: 'Storm-watching coffee date', tags: ['rain','cozy'] },
      { source: 'ai', title: 'Sunrise beach stretch', tags: ['outdoor','sunrise'], location: 'My Khe Beach' },
      { source: 'ai', title: 'Puzzle & pasta night', tags: ['home','cozy'] },
    ];
    (async()=>{
      try{
        const created: Idea[] = [];
        for(const p of pool){
          const res = await fetch('/api/ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
          const body = await res.json();
          created.push({ id: body.id ?? body._id, source: body.source ?? 'ai', title: body.title, description: body.description, place: body.location ? { name: body.location, gmapsUrl: body.location } : undefined, tags: body.tags });
        }
        setIdeas((prev)=> [...created, ...prev]);
      }catch(e){console.error(e)}
    })();
  };

  const openSuggestForIdea = (ideaId: string, dateIso?: string) => {
    setForm((f) => ({ ...f, ideaId, date: dateIso ?? f.date }));
    setOpenSuggest(true);
  };

  // helper to get next rounded hour (e.g., if now=18:34 → 19:00)
  function getDefaultTimeRange() {
    const now = new Date();
    let startHour = now.getHours() + (now.getMinutes() > 0 ? 1 : 0); // round up if minutes > 0
    if (startHour < 18) startHour = 18; // ensure minimum is 18
    if (startHour >= 24) startHour = 23; // prevent overflow

    const endHour = Math.min(startHour + 1, 23);

    const pad = (n: number) => n.toString().padStart(2, "0");
    return {
      start: `${pad(startHour)}:00`,
      end: `${pad(endHour)}:00`,
    };
  }

  // Open edit idea modal
  const openEditIdea = (ideaId: string) => {
    const i = findIdea(ideas, ideaId);
    if (!i) return;
    setEditIdeaForm({ title: i.title, description: i.description ?? "", place: i.place });
    setEditIdeaId(ideaId);
    setEditIdeaOpen(true);
  };

  const saveEditIdea = () => {
    if (!editIdeaId) return;
    (async ()=>{
      try{
        const payload = { id: editIdeaId, title: editIdeaForm.title, description: editIdeaForm.description || undefined, location: editIdeaForm.place?.name };
        const res = await fetch('/api/ideas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const updated = await res.json();
        setIdeas((prev) => prev.map(i => i.id === editIdeaId ? { id: updated.id ?? updated._id, source: updated.source ?? i.source, title: updated.title, description: updated.description, place: updated.location ? { name: updated.location, gmapsUrl: updated.location } : editIdeaForm.place } : i));
      }catch(e){console.error(e)}
      setEditIdeaOpen(false);
      setEditIdeaId(null);
    })();
  };

  // Open edit suggestion modal
  const openEditSuggestion = (sid: string) => {
    const s = findSuggestion(suggestions, sid);
    if (!s) return;
    const start = parseISO(s.start);
    const date = format(start, "yyyy-MM-dd");
    const startTime = format(start, "HH:mm");
    const end = parseISO(s.end);
    const endTime = format(end, "HH:mm");
    setEditSuggestionForm({ ideaId: s.ideaId, date, startTime, endTime, title: s.title ?? "", description: s.description ?? "", place: s.place });
    setEditSuggestionId(sid);
    setEditSuggestionOpen(true);
  };

  const saveEditSuggestion = () => {
    if (!editSuggestionId) return;
    (async ()=>{
      try{
        const startISO = new Date(`${editSuggestionForm.date}T${editSuggestionForm.startTime}:00`).toISOString();
        const endISO = new Date(`${editSuggestionForm.date}T${editSuggestionForm.endTime}:00`).toISOString();
        const payload = { id: editSuggestionId, ideaId: editSuggestionForm.ideaId, startUtc: startISO, endUtc: endISO, titleOverride: editSuggestionForm.title || undefined, descriptionOverride: editSuggestionForm.description || undefined, locationOverride: editSuggestionForm.place?.name };
        const res = await fetch('/api/suggestions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const updated = await res.json();
        setSuggestions((prev) => prev.map(s => s.id === editSuggestionId ? { id: updated.id ?? updated._id, ideaId: updated.ideaId, start: updated.startUtc ?? updated.start, end: updated.endUtc ?? updated.end, title: updated.titleOverride ?? s.title, description: updated.descriptionOverride ?? s.description, place: updated.locationOverride ? { name: updated.locationOverride, gmapsUrl: updated.locationOverride } : s.place, votes: s.votes, status: updated.status ?? s.status } : s));
      }catch(e){console.error(e)}
      setEditSuggestionOpen(false);
      setEditSuggestionId(null);
    })();
  };

  const createSuggestion = () => {
    if (!form.ideaId || !form.date || !form.startTime || !form.endTime) return;
    (async ()=>{
      try{
        const startISO = new Date(`${form.date}T${form.startTime}:00`).toISOString();
        const endISO = new Date(`${form.date}T${form.endTime}:00`).toISOString();
  const payload = { ideaId: form.ideaId, startUtc: startISO, endUtc: endISO } as Record<string, unknown>;
        if (form.place) payload.locationOverride = form.place.name;
        const res = await fetch('/api/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const created = await res.json();
        const mapped: Suggestion = { id: created.id ?? created._id, ideaId: created.ideaId, start: created.startUtc ?? created.start, end: created.endUtc ?? created.end, title: created.titleOverride ?? undefined, description: created.descriptionOverride ?? undefined, place: created.locationOverride ? { name: created.locationOverride, gmapsUrl: created.locationOverride } : undefined, votes: {}, status: created.status ?? 'pending' };
        setSuggestions((prev) => [mapped, ...prev]);
      }catch(e){console.error(e)}
      setOpenSuggest(false);
    })();
  };

  const partnerVote = (sid: string, partnerId: string, vote: "up" | "down") => {
    setSuggestions((prev) => prev.map(s => s.id === sid ? { ...s, votes: { ...s.votes, [partnerId]: vote } } : s));
  };

  const acceptSuggestion = (sid: string) => {
    (async ()=>{
      try{
        const s = suggestions.find(s => s.id === sid);
        if (!s) return;
        // update suggestion status
        await fetch('/api/suggestions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sid, status: 'accepted' }) });
        setSuggestions((prev) => prev.map(ss => ss.id === sid ? { ...ss, status: 'accepted' } : ss));

        // create event referencing the suggestion
        const idea = findIdea(ideas, s.ideaId);
        const eventTitle = s.title ?? idea?.title ?? 'Untitled event';
        const evPayload: Record<string, unknown> = {
          title: eventTitle,
          description: s.description ?? idea?.description ?? undefined,
          location: s.place?.name ?? idea?.place?.name ?? undefined,
          startUtc: s.start,
          endUtc: s.end,
          suggestionId: sid,
        };
        const evRes = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evPayload) });
        const createdEv = await evRes.json();
        setEvents((prev) => [{ id: createdEv.id ?? createdEv._id ?? createdEv.uid ?? uid(), suggestionId: createdEv.suggestionId ?? sid }, ...prev]);
      }catch(e){console.error(e)}
    })();
  };

  const pendingSuggestions = suggestions.filter(s => s.status === "pending");

  return (
    <div className="w-full p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Daeli</h1>
        <div className="text-sm text-muted-foreground">UI-only prototype • de-duplicated data</div>
      </div>

      {/* Debug status */}
      <div className="mb-4 text-xs text-muted-foreground flex items-center gap-4">
        <div>Ideas: <span className="font-medium text-foreground">{ideas.length}</span></div>
        <div>Suggestions: <span className="font-medium text-foreground">{suggestions.length}</span></div>
        <div>Events: <span className="font-medium text-foreground">{events.length}</span></div>
        {lastFetchError && <div className="text-destructive">Load error: {lastFetchError}</div>}
      </div>

      {/* First row: Suggestions + Calendar */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Calendar + Upcoming: right (8/12) */}
        <div className="xl:col-span-8 flex flex-col gap-4 xl:sticky xl:top-24">
          <div className="rounded-2xl border p-3">
            <MonthCalendar
              currentMonth={currentMonth}
              setCurrentMonth={setCurrentMonth}
              events={events}
              suggestions={suggestions}
              ideas={ideas}
              onSelectDay={(d) => setSelectedDayISO(d.toISOString())}
            />
          </div>

          <div className="rounded-2xl border p-3 max-h-80 overflow-auto">
            <UpcomingList events={events} suggestions={suggestions} ideas={ideas} />
          </div>
        </div>

        {/* Suggestions: left (4/12 or whatever feels right) */}
        <div className="xl:col-span-4">
          <SuggestionsPanel
            ideas={ideas}
            pendingSuggestions={pendingSuggestions}
            partnerVote={partnerVote}
            acceptSuggestion={acceptSuggestion}
            selectedDateLabel={selectedDateLabel}
            openSuggest={openSuggest}
            setOpenSuggest={setOpenSuggest}
            form={form}
            setForm={setForm}
            createSuggestion={createSuggestion}
            onEditIdea={openEditIdea}
            onEditSuggestion={openEditSuggestion}
          />
        </div>
      </div>

      {/* Second row: Ideas */}
      <div className="mt-6">
        <IdeasPanel
          ideas={ideas}
          onAddManual={addManualIdea}
          onLoadAiIdeas={loadAiIdeas}
          onOpenSuggest={openSuggestForIdea}
          manualTitle={manualTitle}
          setManualTitle={setManualTitle}
          manualDescription={manualDescription}
          setManualDescription={setManualDescription}
          manualPlace={manualPlace}
          setManualPlace={setManualPlace}
          selectedDayISO={selectedDayISO}
          onEditIdea={openEditIdea}
        />
      </div>

      {/* Edit Idea Dialog */}
      <Dialog open={editIdeaOpen} onOpenChange={setEditIdeaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit idea</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Label>Title</Label>
            <Input value={editIdeaForm.title} onChange={(e)=>setEditIdeaForm({...editIdeaForm, title: e.target.value})} />
            <Label>Description</Label>
            <Textarea value={editIdeaForm.description} onChange={(e)=>setEditIdeaForm({...editIdeaForm, description: e.target.value})} />
            <Label>Location (Google Maps)</Label>
            <LocationPicker value={editIdeaForm.place} onChange={(p)=>setEditIdeaForm({...editIdeaForm, place: p})} />
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={()=>setEditIdeaOpen(false)}>Cancel</Button>
            <Button onClick={saveEditIdea}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Suggestion Dialog */}
      <Dialog open={editSuggestionOpen} onOpenChange={setEditSuggestionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit suggestion</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Label htmlFor="edit-idea">Idea</Label>
            <select id="edit-idea" className="w-full rounded-md border bg-background p-2" value={editSuggestionForm.ideaId} onChange={(e)=>setEditSuggestionForm({...editSuggestionForm, ideaId: e.target.value})}>
              {ideas.map(i=> <option key={i.id} value={i.id}>{i.title}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <Label>Date</Label>
                <Input type="date" value={editSuggestionForm.date} onChange={(e)=>setEditSuggestionForm({...editSuggestionForm, date: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Start</Label>
                  <Input type="time" value={editSuggestionForm.startTime} onChange={(e)=>setEditSuggestionForm({...editSuggestionForm, startTime: e.target.value})} />
                </div>
                <div>
                  <Label>End</Label>
                  <Input type="time" value={editSuggestionForm.endTime} onChange={(e)=>setEditSuggestionForm({...editSuggestionForm, endTime: e.target.value})} />
                </div>
              </div>
            </div>
            <Separator className="my-2" />
            <Label>Title override</Label>
            <Input value={editSuggestionForm.title} onChange={(e)=>setEditSuggestionForm({...editSuggestionForm, title: e.target.value})} />
            <Label>Description override</Label>
            <Textarea value={editSuggestionForm.description} onChange={(e)=>setEditSuggestionForm({...editSuggestionForm, description: e.target.value})} />
            <Label>Location (Google Maps)</Label>
            <LocationPicker value={editSuggestionForm.place} onChange={(p)=>setEditSuggestionForm({...editSuggestionForm, place: p})} />
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={()=>setEditSuggestionOpen(false)}>Cancel</Button>
            <Button onClick={saveEditSuggestion}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
