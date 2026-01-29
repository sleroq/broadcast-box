package chat

import (
	"context"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// NewManagerFromEnv creates a Manager with appropriate repositories based on env vars
func NewManagerFromEnv() *Manager {
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

	var historyRepo HistoryRepository
	var sessionRepo SessionRepository

	if redisURL := os.Getenv("REDIS_URL"); redisURL != "" {
		opts, err := redis.ParseURL(redisURL)
		if err != nil {
			log.Printf("Failed to parse REDIS_URL: %v", err)
			log.Println("Falling back to in-memory storage")
			historyRepo = NewInMemoryHistoryRepository(maxHistory)
		} else {
			client := redis.NewClient(opts)

			// Test connection
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := client.Ping(ctx).Err(); err != nil {
				log.Printf("Failed to connect to Redis: %v", err)
				log.Println("Falling back to in-memory storage")
				historyRepo = NewInMemoryHistoryRepository(maxHistory)
			} else {
				log.Println("Using Redis for chat history storage")
				historyRepo = NewRedisHistoryRepository(client, maxHistory, defaultTTL)
			}
		}
	} else {
		log.Println("Using in-memory chat history storage (set REDIS_URL to enable persistence)")
		historyRepo = NewInMemoryHistoryRepository(maxHistory)
	}

	// Sessions are always in-memory for now (they're ephemeral)
	sessionRepo = NewInMemorySessionRepository(defaultTTL)

	return NewManager(historyRepo, sessionRepo)
}
