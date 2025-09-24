package compute

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/ledongthuc/pdf"
	"github.com/nguyenthenguyen/docx"
	"golang.org/x/net/html"
)

type Job struct {
	Progress  int
	Done      bool
	Frequency [26]int32
	Error     bool
}

// ---- Text extraction per format ----
func extractText(filename string, data []byte) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".txt", ".csv", ".log", ".md":
		return string(data), nil

	case ".html", ".htm":
		doc, err := html.Parse(bytes.NewReader(data))
		if err != nil {
			return "", err
		}
		var buf strings.Builder
		var f func(*html.Node)
		f = func(n *html.Node) {
			if n.Type == html.TextNode {
				buf.WriteString(n.Data + " ")
			}
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				f(c)
			}
		}
		f(doc)
		return buf.String(), nil

	case ".docx":
		// DOCX needs a temp file for the reader
		tmpFile := fmt.Sprintf("./uploads/%s.docx", uuid.NewString())
		if err := os.WriteFile(tmpFile, data, 0644); err != nil {
			return "", err
		}
		r, err := docx.ReadDocxFile(tmpFile)
		if err != nil {
			return "", err
		}
		defer r.Close()
		text := r.Editable().GetContent()
		return text, nil

	case ".pdf":
		tmpFile := fmt.Sprintf("./uploads/%s.pdf", uuid.NewString())
		if err := os.WriteFile(tmpFile, data, 0644); err != nil {
			return "", err
		}

		// Catch panic from ledongthuc/pdf
		defer func() {
			if r := recover(); r != nil {
				err := fmt.Errorf("failed to extract PDF text (malformed or unsupported PDF)")
				fmt.Println(err)
				return
			}
		}()

		f, r, err := pdf.Open(tmpFile)
		if err != nil {
			return "", err
		}
		defer f.Close()

		var buf bytes.Buffer
		b, err := r.GetPlainText()
		if err != nil {
			return "", err
		}
		_, err = buf.ReadFrom(b)
		if err != nil {
			return "", err
		}

		return buf.String(), nil
	}

	return "", fmt.Errorf("unsupported file type: %s", ext)
}

func countLetters(text string, jobId string, jobs map[string]*Job, mu *sync.Mutex) {
	length := len(text)
	if length == 0 {
		return
	}

	step := length / 100
	if step == 0 {
		step = 1
	}

	for i := 0; i < length; i++ {
		b := text[i]
		// lowercase if uppercase ASCII
		if b >= 'A' && b <= 'Z' {
			b += 32
		}
		if b >= 'a' && b <= 'z' {
			mu.Lock()
			jobs[jobId].Frequency[b-'a']++
			mu.Unlock()
		}
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

func extractWithTimeout(filename string, data []byte, timeout time.Duration) (string, error) {
	ch := make(chan struct {
		text string
		err  error
	}, 1)

	go func() {
		text, err := extractText(filename, data)
		ch <- struct {
			text string
			err  error
		}{text, err}
	}()

	select {
	case res := <-ch:
		return res.text, res.err
	case <-time.After(timeout):
		return "", fmt.Errorf("text extraction timed out after %s", timeout)
	}
}

func ProcessJob(jobId string, filename string, jobs map[string]*Job, mu *sync.Mutex) {
	fmt.Printf("Processing job %s for file %s\n", jobId, filename)

	fileBytes, err := os.ReadFile("./uploads/" + filename)
	if err != nil {
		setJobError(jobId, jobs, mu, fmt.Sprintf("failed to read file: %v", err))
		return
	}

	text, err := extractWithTimeout(filename, fileBytes, 10*time.Second)
	if err != nil {
		setJobError(jobId, jobs, mu, err.Error())
		return
	}

	countLetters(text, jobId, jobs, mu)

	mu.Lock()
	if job, exists := jobs[jobId]; exists {
		job.Progress = 100
		job.Done = true
	}
	mu.Unlock()
}

func setJobError(jobId string, jobs map[string]*Job, mu *sync.Mutex, msg string) {
	mu.Lock()
	if job, exists := jobs[jobId]; exists {
		job.Progress = 100
		job.Done = true
		// optional: attach a fake frequency or leave nil
	}
	mu.Unlock()
	fmt.Printf("Job %s failed: %s\n", jobId, msg)
}

func sendError(jobId, message string, updates chan<- map[string]interface{}) {
	updates <- map[string]interface{}{
		"jobId":  jobId,
		"status": "error",
		"error":  message,
	}
}
