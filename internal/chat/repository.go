package chat

import "context"

// HistoryRepository defines the interface for chat history storage
type HistoryRepository interface {
	// AppendEvent adds an event to the room's history
	AppendEvent(ctx context.Context, streamKey string, event Event) error
	// GetEvents retrieves events for a room, optionally starting from lastEventID
	GetEvents(ctx context.Context, streamKey string, lastEventID uint64) ([]Event, error)
	// GetNextEventID returns the next event ID for a room
	GetNextEventID(ctx context.Context, streamKey string) (uint64, error)
}

// SessionRepository defines the interface for session storage
type SessionRepository interface {
	// SaveSession stores a session
	SaveSession(ctx context.Context, session *Session) error
	// GetSession retrieves a session by ID
	GetSession(ctx context.Context, sessionID string) (*Session, bool)
	// TouchSession updates session activity timestamp
	TouchSession(ctx context.Context, sessionID string) bool
	// DeleteSession removes a session
	DeleteSession(ctx context.Context, sessionID string) error
	// CleanupExpired removes sessions older than TTL
	CleanupExpired(ctx context.Context, ttl int64) error
}
