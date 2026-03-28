External Setup & Model Training Instructions

This document outlines the workflow you need to execute outside of the code editor. Because the Next.js app will send a snapshot to your Asus TUF laptop, the Python backend will run the standard PyTorch YOLO model natively.

Phase 1: Data Collection (The 7-Eleven Run)

The Items: Get 3 to 5 distinct items (e.g., Mama Cup Tom Yum, Singha Lemon Soda Can, Lay's Green bag, Meiji Milk).

The Capture: Open your laptop webcam or phone camera. Record a 30-second video of each item. Rotate it, move it closer and further from the lens, and cover parts of it with your hand.

Extraction: Use a free online tool (like ezgif or Roboflow's video upload feature) to extract frames from these videos. Aim for about 100 images per item.

Phase 2: Annotation & Augmentation (Roboflow)

Go to Roboflow.com and create an Object Detection project.

Upload your extracted images.

Draw bounding boxes tightly around the items and label them (e.g., singha_can).

Augmentation: Add Brightness (±25%), Blur (up to 1.5px), and Rotation (±15°). This ensures the model works perfectly under the fluorescent lights in Building 1 at Rangsit.

Click Generate and export the dataset in YOLOv8 format. Copy the Python download snippet.

Phase 3: Train the Model (Google Colab)

Using Colab is the fastest way to get this done today without messing with local PyTorch CUDA drivers on your Asus.

Open Google Colab and create a new notebook.

Go to Runtime > Change runtime type and select T4 GPU.

Run this code block to install Ultralytics and download your Roboflow data:

!pip install ultralytics roboflow

from roboflow import Roboflow
rf = Roboflow(api_key="YOUR_ROBOFLOW_API_KEY")
project = rf.workspace("your-workspace").project("your-project")
dataset = project.version(1).download("yolov8")


Run this code block to train the model:

from ultralytics import YOLO

# Load the fastest Nano model
model = YOLO('yolov8n.pt') 

# Train for 50 epochs
results = model.train(data=f"{dataset.location}/data.yaml", epochs=50, imgsz=640)


Download the Brain: Once training finishes (about 10 mins), look in the left sidebar under runs/detect/train/weights/. Download the best.pt file.

Move best.pt into your backend/ folder. Your AI agent's Python code will automatically look for this file to process the snapshots!

Phase 4: PromptPay Slip Preparation

To test the payment gateway locally:

Open your Thai mobile banking app (KBank, SCB, etc.).

Transfer 1 Baht to a friend.

Save the auto-generated e-slip to your phone. You will use this image to test the upload feature in your Next.js frontend to ensure the pyzbar and promptparse backend libraries successfully read the EMVCo QR code.