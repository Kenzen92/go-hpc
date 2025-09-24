package compute

import (
	"fmt"
	"os"
	"sync"

	"github.com/google/uuid"
)

type Job struct {
	Progress  int
	Done      bool
	Frequency [26]int32
}

func countLetters(fileBytes []byte, jobId string, jobs map[string]*Job, mu *sync.Mutex) {
	// Get length of fileBytes
	length := len(fileBytes)
	fmt.Println("File length:", length)

	// Step for progress update – avoid divide by zero
	step := length / 100
	if step == 0 {
		step = 1
	}

	for i := 0; i < length; i++ {
		b := fileBytes[i]
		// Convert to lowercase if uppercase ASCII
		if b >= 'A' && b <= 'Z' {
			b += 32
		}
		// If it's a-z, update frequency
		if b >= 'a' && b <= 'z' {
			mu.Lock()
			jobs[jobId].Frequency[b-'a']++
			mu.Unlock()
		}
		// Update job progress every step
		if i%step == 0 {
			mu.Lock()
			if job, exists := jobs[jobId]; exists {
				job.Progress = (i * 100) / length
			}
			mu.Unlock()
		}
	}
	mu.Lock()
	if job, exists := jobs[jobId]; exists {
		job.Progress = 100
		job.Done = true
	}
	mu.Unlock()
}

func CreateJob(filename string, jobs map[string]*Job, mu *sync.Mutex) string {
	jobId := uuid.New().String()

	// Initialize the job before processing
	mu.Lock()
	jobs[jobId] = &Job{Progress: 0, Done: false}
	mu.Unlock()

	go ProcessJob(jobId, filename, jobs, mu)
	return jobId
}

func ProcessJob(jobId string, filename string, jobs map[string]*Job, mu *sync.Mutex) {
	fmt.Printf("Processing job %s for file %s\n", jobId, filename)

	// Open the file
	fileBytes, err := os.ReadFile("./uploads/" + filename)
	if err != nil {
		fmt.Printf("Failed to read file: %v\n", err)
		return
	}

	countLetters(fileBytes, jobId, jobs, mu)
}
