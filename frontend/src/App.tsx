import { useState, useCallback } from "react";
import {
  Container,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Button,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import MyDropzone from "./filedrop";

interface FileWithJob {
  fileName: string;
  jobId: string | null;
  progress: number;
  status: string | null;
  result?: number[];
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
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append("chunk", chunk);
        formData.append("fileName", file.name);
        formData.append("chunkIndex", i.toString());
        formData.append("totalChunks", totalChunks.toString());

        try {
          const res = await fetch(UPLOAD_URL, {
            method: "POST",
            body: formData,
          });
          if (!res.ok) throw new Error(await res.text());
          const data = await res.json();
          if (i === totalChunks - 1) resolve(data.job_id);
        } catch (err) {
          return reject(err);
        }

        const progress = Math.round(((i + 1) / totalChunks) * 100);
        setFileJobs((prev) =>
          prev.map((job) =>
            job.fileName === file.name
              ? { ...job, progress, status: "uploading" }
              : job
          )
        );
      }
    });
  };

  const displayProgress = (job: FileWithJob) => {
    if (job.status === "uploading") return job.progress;
    if (job.status === "in-progress") return job.progress;
    if (job.status === "completed") return 100;
    return 0;
  };

  const handleUpload = useCallback(async () => {
    const filesCopy = [...files];
    for (const file of filesCopy) {
      setFiles((prev) => prev.filter((f) => f !== file));
      setFileJobs((prev) => [
        ...prev,
        { fileName: file.name, jobId: null, progress: 0, status: "uploading" },
      ]);

      try {
        const jobId = await uploadFile(file);

        setFileJobs((prev) =>
          prev.map((job) =>
            job.fileName === file.name ? { ...job, jobId } : job
          )
        );

        const ws = new WebSocket(`${PROGRESS_URL}${jobId}`);
        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          const { progress, status, result } = message;

          setFileJobs((prev) =>
            prev.map((job) =>
              job.jobId === jobId ? { ...job, progress, status, result } : job
            )
          );

          if (status === "completed") {
            ws.close();
          }
        };

        ws.onclose = () => console.log(`WebSocket closed for ${file.name}`);
        ws.onerror = (err) => console.error(err);
      } catch (err) {
        console.error(err);
        setFileJobs((prev) =>
          prev.map((job) =>
            job.fileName === file.name ? { ...job, status: "error" } : job
          )
        );
      }
    }
  }, [files]);

  const renderChart = (result: number[]) => {
    const data = result.map((count, index) => ({
      letter: String.fromCharCode(97 + index),
      count,
    }));
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <XAxis dataKey="letter" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" fill="#1976d2" />
        </BarChart>
      </ResponsiveContainer>
    );
  };

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
          <Button onClick={handleUpload} variant="contained" color="primary">
            Start Upload
          </Button>
        </div>
      )}

      {fileJobs.length > 0 && (
        <div>
          <h2>Results:</h2>
          {fileJobs.map((job) => {
            if (job.status === "completed" && job.result) {
              return (
                <Accordion key={job.jobId || job.fileName}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>{job.fileName}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>{renderChart(job.result)}</AccordionDetails>
                </Accordion>
              );
            }

            if (job.status === "error") {
              return (
                <ListItem key={job.jobId || job.fileName}>
                  <ListItemText
                    primary={job.fileName}
                    secondary="❌ Failed to process file (unsupported or corrupted format)"
                    secondaryTypographyProps={{ style: { color: "red" } }}
                  />
                </ListItem>
              );
            }

            return (
              <ListItem key={job.jobId || job.fileName}>
                <ListItemText primary={job.fileName} />
                <LinearProgress
                  variant="determinate"
                  value={displayProgress(job)}
                  sx={{
                    width: 200,
                    ml: 2,
                    "& .MuiLinearProgress-bar": {
                      backgroundColor:
                        job.status === "completed" ? "green" : undefined,
                    },
                  }}
                />
              </ListItem>
            );
          })}
        </div>
      )}
    </Container>
  );
}

export default App;
