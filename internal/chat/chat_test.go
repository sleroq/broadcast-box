package chat

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestChat(t *testing.T) {
	historyRepo := NewInMemoryHistoryRepository(DefaultMaxHistory)
	sessionRepo := NewInMemorySessionRepository(DefaultTTL)
	m := NewManager(historyRepo, sessionRepo)
	streamKey := "test-stream"

	// Test Connect
	sessionID := m.Connect(streamKey)
	assert.NotEmpty(t, sessionID)

	session, ok := m.GetSession(sessionID)
	assert.True(t, ok)
	assert.Equal(t, streamKey, session.StreamKey)

	// Test Subscribe
	ch, cleanup, history, err := m.Subscribe(sessionID, 0)
	assert.NoError(t, err)
	assert.Empty(t, history)
	defer cleanup()

	// Consume connected event
	select {
	case event := <-ch:
		assert.Equal(t, EventTypeConnected, event.Type)
	case <-time.After(1 * time.Second):
		t.Fatal("timeout waiting for connected event")
	}

	// Test Send
	err = m.Send(sessionID, "hello", "user1")
	assert.NoError(t, err)

	select {
	case event := <-ch:
		assert.Equal(t, "hello", event.Message.Text)
		assert.Equal(t, "user1", event.Message.DisplayName)
		assert.Equal(t, uint64(1), event.ID)
	case <-time.After(1 * time.Second):
		t.Fatal("timeout waiting for message")
	}

	// Test History
	_, cleanup2, history2, err := m.Subscribe(sessionID, 0)
	assert.NoError(t, err)
	assert.Len(t, history2, 1)
	assert.Equal(t, "hello", history2[0].Message.Text)
	cleanup2()

	// Test Resume
	ch3, cleanup3, history3, err := m.Subscribe(sessionID, 1)
	assert.NoError(t, err)
	assert.Empty(t, history3)

	// Consume connected event
	select {
	case event := <-ch3:
		assert.Equal(t, EventTypeConnected, event.Type)
	case <-time.After(1 * time.Second):
		t.Fatal("timeout waiting for connected event")
	}

	err = m.Send(sessionID, "world", "user2")
	assert.NoError(t, err)

	select {
	case event := <-ch3:
		assert.Equal(t, "world", event.Message.Text)
		assert.Equal(t, uint64(2), event.ID)
	case <-time.After(1 * time.Second):
		t.Fatal("timeout waiting for message")
	}
	cleanup3()
}

func TestInMemoryHistoryRepository(t *testing.T) {
	repo := NewInMemoryHistoryRepository(100)
	ctx := t.Context()
	streamKey := "test-room"

	// Test GetNextEventID on empty room
	nextID, err := repo.GetNextEventID(ctx, streamKey)
	assert.NoError(t, err)
	assert.Equal(t, uint64(1), nextID)

	// Test AppendEvent
	event1 := Event{ID: 1, Type: EventTypeMessage, Message: Message{Text: "hello"}}
	err = repo.AppendEvent(ctx, streamKey, event1)
	assert.NoError(t, err)

	// Test GetNextEventID after append
	nextID, err = repo.GetNextEventID(ctx, streamKey)
	assert.NoError(t, err)
	assert.Equal(t, uint64(2), nextID)

	// Test GetEvents
	events, err := repo.GetEvents(ctx, streamKey, 0)
	assert.NoError(t, err)
	assert.Len(t, events, 1)
	assert.Equal(t, "hello", events[0].Message.Text)

	// Test GetEvents with lastEventID
	event2 := Event{ID: 2, Type: EventTypeMessage, Message: Message{Text: "world"}}
	err = repo.AppendEvent(ctx, streamKey, event2)
	assert.NoError(t, err)

	events, err = repo.GetEvents(ctx, streamKey, 1)
	assert.NoError(t, err)
	assert.Len(t, events, 1)
	assert.Equal(t, "world", events[0].Message.Text)
}

func TestInMemorySessionRepository(t *testing.T) {
	repo := NewInMemorySessionRepository(1 * time.Hour)
	ctx := t.Context()

	// Test SaveSession and GetSession
	session := &Session{
		ID:           "session-1",
		StreamKey:    "test-stream",
		LastActivity: time.Now(),
	}
	err := repo.SaveSession(ctx, session)
	assert.NoError(t, err)

	retrieved, ok := repo.GetSession(ctx, "session-1")
	assert.True(t, ok)
	assert.Equal(t, "test-stream", retrieved.StreamKey)

	// Test TouchSession
	ok = repo.TouchSession(ctx, "session-1")
	assert.True(t, ok)

	ok = repo.TouchSession(ctx, "nonexistent")
	assert.False(t, ok)

	// Test DeleteSession
	err = repo.DeleteSession(ctx, "session-1")
	assert.NoError(t, err)

	_, ok = repo.GetSession(ctx, "session-1")
	assert.False(t, ok)
}

func TestMaxHistory(t *testing.T) {
	repo := NewInMemoryHistoryRepository(3)
	ctx := t.Context()
	streamKey := "test-room"

	// Add 5 events
	for i := 1; i <= 5; i++ {
		event := Event{ID: uint64(i), Type: EventTypeMessage, Message: Message{Text: "msg"}}
		err := repo.AppendEvent(ctx, streamKey, event)
		assert.NoError(t, err)
	}

	// Should only have last 3 events
	events, err := repo.GetEvents(ctx, streamKey, 0)
	assert.NoError(t, err)
	assert.Len(t, events, 3)
	// Events should be 3, 4, 5 (oldest to newest)
	assert.Equal(t, uint64(3), events[0].ID)
	assert.Equal(t, uint64(5), events[2].ID)
}
