!pip install roboflow

from roboflow import Roboflow
rf = Roboflow(api_key="d64UW0QUGgRx8hIHCSq1")
project = rf.workspace("thatoes-workspace").project("my-first-project-vfhrl")
version = project.version(1)
dataset = version.download("yolov8")
                