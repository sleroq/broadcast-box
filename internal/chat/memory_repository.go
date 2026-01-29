package chat

import (
	"context"
	"sync"
	"time"
)

// InMemoryHistoryRepository implements HistoryRepository with in-memory storage
type InMemoryHistoryRepository struct {
	mu           sync.RWMutex
	histories    map[string][]Event
	nextEventIDs map[string]uint64
	maxHistory   int
}

// NewInMemoryHistoryRepository creates a new in-memory history repository
func NewInMemoryHistoryRepository(maxHistory int) *InMemoryHistoryRepository {
	return &InMemoryHistoryRepository{
		histories:    make(map[string][]Event),
		nextEventIDs: make(map[string]uint64),
		maxHistory:   maxHistory,
	}
}

// AppendEvent adds an event to the room's history
func (r *InMemoryHistoryRepository) AppendEvent(ctx context.Context, streamKey string, event Event) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	history := r.histories[streamKey]
	if len(history) >= r.maxHistory {
		history = append(history[1:], event)
	} else {
		history = append(history, event)
	}
	r.histories[streamKey] = history
	r.nextEventIDs[streamKey] = event.ID + 1
	return nil
}

// GetEvents retrieves events for a room, optionally starting from lastEventID
func (r *InMemoryHistoryRepository) GetEvents(ctx context.Context, streamKey string, lastEventID uint64) ([]Event, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	history := r.histories[streamKey]
	if lastEventID == 0 {
		result := make([]Event, len(history))
		copy(result, history)
		return result, nil
	}

	var result []Event
	for _, ev := range history {
		if ev.ID > lastEventID {
			result = append(result, ev)
		}
	}
	return result, nil
}

// GetNextEventID returns the next event ID for a room
func (r *InMemoryHistoryRepository) GetNextEventID(ctx context.Context, streamKey string) (uint64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if id, ok := r.nextEventIDs[streamKey]; ok {
		return id, nil
	}
	return 1, nil
}

// InMemorySessionRepository implements SessionRepository with in-memory storage
type InMemorySessionRepository struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	ttl      time.Duration
}

// NewInMemorySessionRepository creates a new in-memory session repository
func NewInMemorySessionRepository(ttl time.Duration) *InMemorySessionRepository {
	return &InMemorySessionRepository{
		sessions: make(map[string]*Session),
		ttl:      ttl,
	}
}

// SaveSession stores a session
func (r *InMemorySessionRepository) SaveSession(ctx context.Context, session *Session) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.sessions[session.ID] = session
	return nil
}

// GetSession retrieves a session by ID
func (r *InMemorySessionRepository) GetSession(ctx context.Context, sessionID string) (*Session, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	s, ok := r.sessions[sessionID]
	if !ok {
		return nil, false
	}

	s.LastActivity = time.Now()
	copy := *s
	return &copy, true
}

// TouchSession updates session activity timestamp
func (r *InMemorySessionRepository) TouchSession(ctx context.Context, sessionID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	s, ok := r.sessions[sessionID]
	if !ok {
		return false
	}

	s.LastActivity = time.Now()
	return true
}

// DeleteSession removes a session
func (r *InMemorySessionRepository) DeleteSession(ctx context.Context, sessionID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.sessions, sessionID)
	return nil
}

// CleanupExpired removes sessions older than TTL
func (r *InMemorySessionRepository) CleanupExpired(ctx context.Context, ttlSeconds int64) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	ttl := time.Duration(ttlSeconds) * time.Second
	for id, s := range r.sessions {
		if now.Sub(s.LastActivity) > ttl {
			delete(r.sessions, id)
		}
	}
	return nil
}
