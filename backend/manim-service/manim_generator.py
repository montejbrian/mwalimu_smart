import os
import hashlib
import google.generativeai as genai
from dotenv import load_dotenv
import subprocess
import tempfile
from typing import Optional

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

# Gemini AI
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

VIDEO_DIR = os.path.join(os.path.dirname(__file__), 'videos')
os.makedirs(VIDEO_DIR, exist_ok=True)

def generate_manim_code(step_text: str, topic: str, script: Optional[str] = None, error_log: str = "", previous_code: str = "", bg_image_path: Optional[str] = None) -> str:
    """Manim Programmer Agent: Generates Manim code using Gemini."""
    
    model_name = os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')
    model = genai.GenerativeModel(model_name)
    
    if error_log and previous_code:
        prompt = f"""
# DEBUGGING MODE
You generated Manim code that failed. Fix it.
ERROR: {error_log}

PREVIOUS CODE:
{previous_code}

- Ensure the code is complete, valid, and fixes the error above.
- Return ONLY the corrected Python code.
"""
    else:
        bg_instruction = ""
        if bg_image_path:
            bg_instruction = f"""
# IMAGE USAGE (MINIMAL SIZE)
An image is available at: '{bg_image_path}'.
DO NOT use it as a fullscreen background. 
If you use it, you MUST load this image using `ImageMobject('{bg_image_path}')` and scale it to a minimal size (e.g., width 2.0 or 3.0) to fit in the room with other objects.
Example: 
img = ImageMobject('{bg_image_path}').scale_to_fit_width(2.0).to_corner(UL)
self.add(img)
"""

        prompt = f"""
# CONTEXT
You are a Manim Programmer Agent for MwalimuSmart. You create educational animations.

# OBJECTIVE
Generate Python code using 'manim' for:
Topic: {topic}
Step: {step_text}

{bg_instruction}

# VISUAL ARRANGEMENT & EXPLANATION
1. **OBJECTS IN MOTION**: You MUST focus on generating shapes and objects set in motion to explain the concept. DO NOT rely heavily on images. Build rich, dynamic scenes using Manim shapes (Circles, Rectangles, Arrows, etc.).
2. **NO OVERLAP**: Geometric shapes, text, and labels MUST NOT overlap.
3. **GROUPING**: Use 'VGroup' to manage multiple objects.
4. **SPACING**: Use '.arrange(DOWN, buff=0.5)' or '.next_to(other_obj, RIGHT, buff=1.0)'.
5. **LABELS**: Always place labels using '.next_to(object, direction)' logic.
6. **DETAIL**: Build rich scenes. If explaining a circuit, show the battery, wires, resistor, and current flow arrows using geometric primitives.

# STYLE (CLEAR Framework)
1. **CONCISE**: Every animation must be educational, but NOT sparse. Create a comprehensive visual representation with moving shapes.
2. **LOGICAL**: Sequence your animations carefully.
3. **EXPLICIT**: High contrast colors only.

# RESPONSE FORMAT
Return ONLY the complete Python code. No explanations.

# EXAMPLE STRUCTURE
```python
from manim import *

class GeneratedScene(Scene):
    def construct(self):
        # 1. Setup rich environment
        axes = Axes(x_range=[0, 5], y_range=[0, 5], axis_config={{"include_tip": True}})
        labels = axes.get_axis_labels(x_label="Time", y_label="Value")
        
        # 2. Detailed objects
        circle = Circle(radius=1.0, color=BLUE).shift(UP*1)
        dot = Dot(color=YELLOW).move_to(circle.get_start())
        trace = TracedPath(dot.get_center, stroke_color=YELLOW, stroke_width=4)
        
        main_vgroup = VGroup(axes, labels, circle, dot, trace).center()
        
        # 3. Animation sequence
        self.play(Create(axes), Write(labels))
        self.play(Create(circle))
        self.add(trace)
        self.play(MoveAlongPath(dot, circle), run_time=5)
```
"""
    
    import json
    import urllib.request
    
    print(f"Generating Manim code using NVIDIA API...")
    nvidia_api_key = os.getenv("NVIDIA_API_KEY")
    if not nvidia_api_key:
        raise Exception("NVIDIA_API_KEY is not set.")
        
    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {nvidia_api_key}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "meta/llama-3.1-70b-instruct",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "top_p": 1,
        "max_tokens": 2048,
    }
    
    req = urllib.request.Request(url, headers=headers, data=json.dumps(data).encode('utf-8'))
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            code = result['choices'][0]['message']['content']
    except Exception as nvidia_e:
        raise Exception(f"NVIDIA API failed. Error: {str(nvidia_e)}")

    # Clean the code (remove markdown code blocks if present)
    if '```python' in code:
        code = code.split('```python')[1].split('```')[0]
    elif '```' in code:
        code = code.split('```')[1].split('```')[0]
    
    return code.strip()

def generate_animation(step_text: str, step_number: int, topic: str, script: Optional[str] = None, bg_image_path: Optional[str] = None) -> str:
    """Generate Manim animation with a self-correction loop."""
    
    # Create cache key
    cache_key = hashlib.md5(f"{topic}:{step_text}:{script}:{bg_image_path}".encode()).hexdigest()
    video_filename = f"animation_{cache_key}.mp4"
    video_path = os.path.join(VIDEO_DIR, video_filename)
    
    # Return cached video if exists
    if os.path.exists(video_path):
        print(f"Using cached animation: {video_filename}")
        return video_path
    
    max_attempts = 3
    error_log: str = ""
    previous_code: str = ""
    
    for attempt in range(max_attempts):
        try:
            print(f"Attempt {attempt + 1}: Generating Manim code...")
            manim_code: str = generate_manim_code(step_text, topic, script, error_log, previous_code, bg_image_path)
            previous_code = manim_code
            
            # Create temporary Python file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(manim_code)
                temp_script = f.name
            
            # Render animation with Manim
            print(f"Attempt {attempt + 1}: Rendering animation...")
            output_dir = tempfile.mkdtemp()
            
            result = subprocess.run([
                'manim',
                '-ql',  # Low quality for faster rendering
                '--format=mp4',
                f'--output_file={video_filename}',
                temp_script,
                'GeneratedScene'
            ], capture_output=True, text=True, cwd=output_dir)
            
            # Cleanup script immediately
            os.unlink(temp_script)
            
            if result.returncode != 0:
                print(f"Attempt {attempt + 1} failed. Capturing error for correction...")
                error_log = result.stderr or ""
                continue # Try next attempt with correction
            
            # Find the generated video
            media_dir = os.path.join(output_dir, 'media', 'videos')
            found_video = False
            for root, dirs, files in os.walk(media_dir):
                for file in files:
                    if file.endswith('.mp4'):
                        generated_video = os.path.join(root, file)
                        os.rename(generated_video, video_path)
                        found_video = True
                        break
                if found_video: break
            
            if not os.path.exists(video_path):
                error_log = "Video file not found after rendering process."
                continue
            
            print(f"Animation generated successfully on attempt {attempt + 1}")
            return video_path
            
        except Exception as e:
            print(f"Exception on attempt {attempt + 1}: {e}")
            error_log = str(e)
            
    raise Exception(f"Failed to generate animation after {max_attempts} attempts. Last error: {error_log}")
