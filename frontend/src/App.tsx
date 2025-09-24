import { useState, useCallback } from 'react';
import { Container, LinearProgress, List, ListItem, ListItemText } from '@mui/material';
import MyDropzone from './filedrop';

// Data structure for file including name, jobID and progress
interface FileWithJob {
  fileName: string;
  jobId: string | null;
  progress: number;
  status: string | null;
}



function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [fileJobs, setFileJobs] = useState<FileWithJob[]>([]);

  const UPLOAD_URL = import.meta.env.VITE_BACKEND_UPLOAD_URL;
  const PROGRESS_URL = import.meta.env.VITE_BACKEND_PROGRESS_URL; 

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk

const uploadFile = (file: File) => {
  return new Promise<string>(async (resolve, reject) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    console.log(`Uploading ${file.name} in ${totalChunks} chunks`);

    for (let i = 0; i < totalChunks; i++) {
      console.log(`Uploading chunk ${i + 1}/${totalChunks} for ${file.name} with chunk size ${CHUNK_SIZE}`);
      const start = i * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append("chunk", chunk);
      formData.append("fileName", file.name);
      formData.append("chunkIndex", i.toString());
      formData.append("totalChunks", totalChunks.toString());

      try {
        const res = await fetch(UPLOAD_URL, { method: "POST", body: formData });
        console.log(res);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        // Only resolve jobId after last chunk
        if (i === totalChunks - 1) resolve(data.job_id);
      } catch (err) {
        return reject(err);
      }

      // Update progress bar
      const progress = Math.round(((i + 1) / totalChunks) * 100);
      setFileJobs((prev) =>
        prev.map((job) =>
          job.fileName === file.name ? { ...job, progress, status: 'uploading' } : job
        )
      );
    }
  });
};


const displayProgress = (job: FileWithJob) => {
  if (job.status === "uploading") return job.progress; // upload progress
  if (job.status === "in-progress") return job.progress; // HPC job progress
  if (job.status === "completed") return 100;
  return 0;
};

// Function to handle uploading files one by one
const handleUpload = useCallback(async () => {
  const filesCopy = [...files];

  for (const file of filesCopy) {
    setFiles((prev) => prev.filter((f) => f !== file));
    setFileJobs((prev) => [
      ...prev,
      { fileName: file.name, jobId: null, progress: 0, status: 'uploading' },
    ]);

    try {
      const jobId = await uploadFile(file);

      setFileJobs((prev) =>
        prev.map((job) => (job.fileName === file.name ? { ...job, jobId } : job))
      );

      // Connect WebSocket for progress
      const ws = new WebSocket(`${PROGRESS_URL}${jobId}`);
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const { progress, status } = message;
        console.log(`Progress for ${file.name}: ${progress}% - Status: ${status}`);

        if (status === 'completed') {
          ws.close();
        }

        setFileJobs((prev) =>
          prev.map((job) => (job.jobId === jobId ? { ...job, progress, status } : job))
        );
      };

      ws.onclose = () => console.log(`WebSocket closed for ${file.name}`);
      ws.onerror = (err) => console.error(err);

    } catch (err) {
      console.error(err);
      setFileJobs((prev) =>
        prev.map((job) =>
          job.fileName === file.name ? { ...job, status: 'error' } : job
        )
      );
    }
  }
}, [files]);

  return (
    <Container>
      <h1>Distributed HPC Frontend</h1>

      <MyDropzone setFiles={setFiles} />

      {files.length > 0 && (
        <div>
          <h2>Selected Files:</h2>
          <List>
            {files.map((file) => (
              <ListItem key={file.name}>
                <ListItemText primary={file.name} />
              </ListItem>
            ))}
          </List>
          <button onClick={handleUpload}>Start Upload</button>
        </div>
      )}

      {fileJobs.length > 0 && (
        <div>
          <h2>In Progress:</h2>
          <List>
            {fileJobs.map((job) => (
              <ListItem key={job.jobId || job.fileName}>
                <ListItemText primary={job.fileName} />
                <LinearProgress
                  variant="determinate"
                  value={displayProgress(job)}
                  sx={{
                    width: 200,
                    ml: 2,
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: job.status === 'completed' ? 'green' : undefined,
                    },
                  }}
                />
              </ListItem>
            ))}
          </List>
        </div>
      )}
    </Container>
  );
}

export default App;
