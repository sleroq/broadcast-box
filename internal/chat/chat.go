package chat

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	DefaultMaxHistory      = 10000
	DefaultTTL             = 72 * time.Hour
	DefaultCleanupInterval = 1 * time.Hour

	EventTypeMessage   = "message"
	EventTypeConnected = "connected"
)

type Message struct {
	ID          string `json:"id"`
	TS          int64  `json:"ts"`
	Text        string `json:"text"`
	DisplayName string `json:"displayName"`
}

type Event struct {
	ID      uint64  `json:"-"`
	Type    string  `json:"type"`
	Message Message `json:"message"`
}

type subscriber struct {
	ch chan Event
}

type Room struct {
	streamKey    string
	mu           sync.Mutex
	subscribers  map[string]*subscriber
	lastActivity time.Time
}

type Session struct {
	ID           string
	StreamKey    string
	LastActivity time.Time
}

type Manager struct {
	historyRepo HistoryRepository
	sessionRepo SessionRepository

	mu    sync.RWMutex
	rooms map[string]*Room

	maxHistory      int
	defaultTTL      time.Duration
	cleanupInterval time.Duration
}

// NewManager creates a new chat manager with the provided repositories
func NewManager(historyRepo HistoryRepository, sessionRepo SessionRepository) *Manager {
	maxHistory := DefaultMaxHistory
	if val := os.Getenv("CHAT_MAX_HISTORY"); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			maxHistory = i
		}
	}

	defaultTTL := DefaultTTL
	if val := os.Getenv("CHAT_DEFAULT_TTL"); val != "" {
		if d, err := time.ParseDuration(val); err == nil {
			defaultTTL = d
		}
	}

	cleanupInterval := DefaultCleanupInterval
	if val := os.Getenv("CHAT_CLEANUP_INTERVAL"); val != "" {
		if d, err := time.ParseDuration(val); err == nil {
			cleanupInterval = d
		}
	}

	m := &Manager{
		historyRepo:     historyRepo,
		sessionRepo:     sessionRepo,
		rooms:           make(map[string]*Room),
		maxHistory:      maxHistory,
		defaultTTL:      defaultTTL,
		cleanupInterval: cleanupInterval,
	}
	go m.cleanupLoop()
	return m
}

func (m *Manager) Connect(streamKey string) string {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	sessionID := uuid.New().String()
	m.sessionRepo.SaveSession(context.Background(), &Session{
		ID:           sessionID,
		StreamKey:    streamKey,
		LastActivity: now,
	})

	if _, ok := m.rooms[streamKey]; !ok {
		m.rooms[streamKey] = &Room{
			streamKey:    streamKey,
			subscribers:  make(map[string]*subscriber),
			lastActivity: now,
		}
	}

	return sessionID
}

func (m *Manager) GetSession(sessionID string) (*Session, bool) {
	return m.sessionRepo.GetSession(context.Background(), sessionID)
}

func (m *Manager) TouchSession(sessionID string) bool {
	return m.sessionRepo.TouchSession(context.Background(), sessionID)
}

func (m *Manager) Subscribe(sessionID string, lastEventID uint64) (chan Event, func(), []Event, error) {
	now := time.Now()

	session, ok := m.sessionRepo.GetSession(context.Background(), sessionID)
	if !ok {
		return nil, nil, nil, fmt.Errorf("invalid session")
	}
	session.LastActivity = now

	m.mu.Lock()
	room, ok := m.rooms[session.StreamKey]
	if !ok {
		room = &Room{
			streamKey:    session.StreamKey,
			subscribers:  make(map[string]*subscriber),
			lastActivity: now,
		}
		m.rooms[session.StreamKey] = room
	}
	m.mu.Unlock()

	room.mu.Lock()
	defer room.mu.Unlock()

	room.lastActivity = now
	subID := uuid.New().String()
	ch := make(chan Event, 100)
	ch <- Event{Type: EventTypeConnected}
	sub := &subscriber{ch: ch}
	room.subscribers[subID] = sub

	history, err := m.historyRepo.GetEvents(context.Background(), session.StreamKey, lastEventID)
	if err != nil {
		cleanup := func() {
			room.mu.Lock()
			defer room.mu.Unlock()
			delete(room.subscribers, subID)
			close(ch)
		}
		return nil, cleanup, nil, err
	}

	cleanup := func() {
		room.mu.Lock()
		defer room.mu.Unlock()
		delete(room.subscribers, subID)
		close(ch)
	}

	return ch, cleanup, history, nil
}

func (m *Manager) Send(sessionID string, text string, displayName string) error {
	now := time.Now()

	session, ok := m.sessionRepo.GetSession(context.Background(), sessionID)
	if !ok {
		return fmt.Errorf("invalid session")
	}
	session.LastActivity = now

	nextEventID, err := m.historyRepo.GetNextEventID(context.Background(), session.StreamKey)
	if err != nil {
		return fmt.Errorf("failed to get next event ID: %w", err)
	}

	event := Event{
		ID:   nextEventID,
		Type: EventTypeMessage,
		Message: Message{
			ID:          uuid.New().String(),
			TS:          now.UnixMilli(),
			Text:        text,
			DisplayName: displayName,
		},
	}

	if err := m.historyRepo.AppendEvent(context.Background(), session.StreamKey, event); err != nil {
		return fmt.Errorf("failed to append event: %w", err)
	}

	m.mu.RLock()
	room, ok := m.rooms[session.StreamKey]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("room not found")
	}

	room.mu.Lock()
	defer room.mu.Unlock()

	room.lastActivity = now
	for _, sub := range room.subscribers {
		select {
		case sub.ch <- event:
		default:
			// Subscriber slow, drop message or handle as needed
		}
	}

	return nil
}

func (m *Manager) cleanupLoop() {
	ticker := time.NewTicker(m.cleanupInterval)
	for range ticker.C {
		m.cleanup()
	}
}

func (m *Manager) cleanup() {
	ctx := context.Background()

	m.sessionRepo.CleanupExpired(ctx, int64(m.defaultTTL.Seconds()))

	// Cleanup empty rooms
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	for key, r := range m.rooms {
		r.mu.Lock()
		if len(r.subscribers) == 0 && now.Sub(r.lastActivity) > m.defaultTTL {
			delete(m.rooms, key)
		}
		r.mu.Unlock()
	}
}
