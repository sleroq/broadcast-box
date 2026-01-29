package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisHistoryRepository implements HistoryRepository using Redis
type RedisHistoryRepository struct {
	client     *redis.Client
	maxHistory int
	ttl        time.Duration
}

// NewRedisHistoryRepository creates a new Redis-based history repository
func NewRedisHistoryRepository(client *redis.Client, maxHistory int, ttl time.Duration) *RedisHistoryRepository {
	return &RedisHistoryRepository{
		client:     client,
		maxHistory: maxHistory,
		ttl:        ttl,
	}
}

// AppendEvent adds an event to the room's history
func (r *RedisHistoryRepository) AppendEvent(ctx context.Context, streamKey string, event Event) error {
	key := fmt.Sprintf("chat:history:%s", streamKey)
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	// Use Redis list with RPUSH + LTRIM to maintain max size
	pipe := r.client.Pipeline()
	pipe.RPush(ctx, key, data)
	pipe.LTrim(ctx, key, int64(-r.maxHistory), -1)
	pipe.Expire(ctx, key, r.ttl)
	_, err = pipe.Exec(ctx)
	return err
}

// GetEvents retrieves events for a room, optionally starting from lastEventID
func (r *RedisHistoryRepository) GetEvents(ctx context.Context, streamKey string, lastEventID uint64) ([]Event, error) {
	key := fmt.Sprintf("chat:history:%s", streamKey)
	data, err := r.client.LRange(ctx, key, 0, -1).Result()
	if err != nil {
		return nil, err
	}

	var events []Event
	for _, item := range data {
		var event Event
		if err := json.Unmarshal([]byte(item), &event); err != nil {
			continue
		}
		if lastEventID == 0 || event.ID > lastEventID {
			events = append(events, event)
		}
	}
	return events, nil
}

// GetNextEventID returns the next event ID for a room
func (r *RedisHistoryRepository) GetNextEventID(ctx context.Context, streamKey string) (uint64, error) {
	key := fmt.Sprintf("chat:history:%s", streamKey)
	count, err := r.client.LLen(ctx, key).Result()
	if err != nil {
		return 1, err
	}
	return uint64(count) + 1, nil
}
