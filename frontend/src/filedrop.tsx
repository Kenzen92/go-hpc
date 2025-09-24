import React, { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Box, Typography, Paper } from "@mui/material";

function MyDropzone({ setFiles }: { setFiles: (file: File[] | []) => void }) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    console.log(acceptedFiles);
    setFiles(acceptedFiles.length > 0 ? acceptedFiles : []);
  }, [setFiles]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    multiple: true,
    maxFiles: 10,
    accept: {
      "text/html": [".html", ".htm"],
      "text/plain": [".txt"],
      "application/json": [".json"],
      "application/xml": [".xml"],
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls", ".xlsx"],
      "application/pdf": [".pdf"],
    },
  });

  return (
    <Paper
      elevation={3}
      {...getRootProps()}
      sx={{
        border: "2px dashed",
        borderColor: isDragReject
          ? "error.main"
          : isDragActive
          ? "primary.main"
          : "grey.400",
        backgroundColor: isDragActive ? "action.hover" : "background.paper",
        borderRadius: 3,
        p: 4,
        textAlign: "center",
        cursor: "pointer",
        transition: "all 0.3s ease",
        "&:hover": {
          borderColor: "primary.main",
          backgroundColor: "action.hover",
        },
      }}
    >
      <input {...getInputProps()} />
      {isDragReject ? (
        <Typography color="error">File type not accepted</Typography>
      ) : isDragActive ? (
        <Typography color="primary">Drop the file here…</Typography>
      ) : (
        <Typography color="textSecondary">
          Drag & drop a file here, or click to select one
        </Typography>
      )}
    </Paper>
  );
}

export default MyDropzone;
