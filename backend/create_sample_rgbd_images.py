"""
Sample RGB-D Image Generator for Testing & Demo
Generates five visually DISTINCT 4-channel RGB-D images with unique object shapes,
color palettes, and depth profiles in backend/uploads/samples/ for instant testing.
"""

import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def _draw_ellipse_depth(depth_arr, cx, cy, rx, ry, depth_val, h, w):
    """Fills an elliptical region with a specific depth value."""
    y_grid, x_grid = np.indices((h, w), dtype=np.float32)
    mask = ((x_grid - cx) ** 2 / max(rx, 1) ** 2 + (y_grid - cy) ** 2 / max(ry, 1) ** 2) <= 1.0
    depth_arr[mask] = depth_val


def create_sample_rgbd_images(output_dir):
    os.makedirs(output_dir, exist_ok=True)

    w, h = 480, 360
    generated_files = []

    # ========== Scene 1: Warehouse Box Stack ==========
    img1 = Image.new('RGB', (w, h), color=(35, 30, 45))
    d1 = ImageDraw.Draw(img1)
    # Floor gradient
    for row in range(h // 2, h):
        t = (row - h // 2) / (h // 2)
        c = int(40 + t * 30)
        d1.line([(0, row), (w, row)], fill=(c, c - 5, c + 5))
    # Large box (back, far)
    d1.rectangle([60, 100, 220, 260], fill=(180, 90, 40), outline=(220, 130, 60), width=3)
    d1.rectangle([70, 110, 210, 150], fill=(200, 110, 50))  # label stripe
    d1.text((90, 120), "FRAGILE", fill=(255, 255, 255))
    # Medium box (middle, closer)
    d1.rectangle([200, 140, 340, 280], fill=(60, 130, 180), outline=(80, 160, 210), width=3)
    d1.rectangle([210, 150, 330, 180], fill=(70, 150, 200))
    d1.text((230, 155), "CLUBS-07", fill=(255, 255, 255))
    # Small box (front, closest)
    d1.rectangle([310, 200, 430, 300], fill=(200, 60, 80), outline=(240, 80, 100), width=3)
    d1.text((330, 240), "THIS UP", fill=(255, 255, 220))
    # Tape roll on floor
    d1.ellipse([140, 270, 200, 320], fill=(180, 170, 120), outline=(140, 130, 90), width=2)
    d1.ellipse([155, 282, 185, 308], fill=(35, 30, 45))  # hole
    d1.text((15, 15), "Warehouse — Multi-Box Stack", fill=(200, 200, 200))

    depth1 = np.full((h, w), 210, dtype=np.float32)  # far background
    y_g, x_g = np.indices((h, w), dtype=np.float32)
    floor_mask = y_g > h // 2
    depth1[floor_mask] = 160 - (y_g[floor_mask] - h // 2) / (h // 2) * 40  # floor recedes
    # Large box at 1.4m
    depth1[100:260, 60:220] = 140
    # Medium box at 1.0m
    depth1[140:280, 200:340] = 100
    # Small box at 0.65m
    depth1[200:300, 310:430] = 65
    # Tape roll at 0.8m
    _draw_ellipse_depth(depth1, 170, 295, 30, 25, 80, h, w)
    noise1 = np.random.normal(0, 2.5, (h, w))
    depth1 = np.clip(depth1 + noise1, 15, 245).astype(np.uint8)

    # ========== Scene 2: Kitchen Countertop ==========
    img2 = Image.new('RGB', (w, h), color=(25, 35, 30))
    d2 = ImageDraw.Draw(img2)
    # Countertop surface
    for row in range(h // 3, h):
        t = (row - h // 3) / (h * 2 // 3)
        c = int(70 + t * 40)
        d2.line([(0, row), (w, row)], fill=(c, c - 10, c - 20))
    # Tall bottle (left, far)
    d2.rectangle([50, 60, 110, 280], fill=(30, 120, 70), outline=(40, 150, 90), width=2)
    d2.ellipse([55, 45, 105, 75], fill=(30, 120, 70))  # cap
    d2.rectangle([60, 120, 100, 200], fill=(40, 140, 80))  # label
    d2.text((65, 150), "BIO", fill=(255, 255, 255))
    # Coffee mug (center, medium distance)
    d2.ellipse([190, 170, 290, 210], fill=(220, 200, 170))  # rim top
    d2.rectangle([195, 195, 285, 290], fill=(200, 180, 150), outline=(170, 150, 120), width=2)
    d2.ellipse([190, 270, 290, 300], fill=(180, 160, 130))  # base
    d2.arc([290, 210, 330, 270], 270, 90, fill=(180, 160, 130), width=4)  # handle
    d2.text((215, 230), "☕", fill=(100, 70, 40))
    # Small jar (right, close)
    d2.rectangle([360, 200, 440, 300], fill=(240, 200, 60), outline=(200, 170, 40), width=2)
    d2.ellipse([355, 185, 445, 215], fill=(220, 50, 50))  # red lid
    d2.text((375, 240), "JAM", fill=(120, 40, 20))
    # Spoon
    d2.line([(320, 310), (400, 260)], fill=(180, 180, 190), width=3)
    d2.ellipse([310, 300, 340, 330], fill=(190, 190, 200))
    d2.text((15, 15), "Kitchen — Mug, Bottle & Jar", fill=(200, 200, 200))

    depth2 = np.full((h, w), 200, dtype=np.float32)
    floor_mask2 = y_g > h // 3
    depth2[floor_mask2] = 170 - (y_g[floor_mask2] - h // 3) / (h * 2 // 3) * 50
    depth2[60:280, 50:110] = 150   # bottle (far)
    depth2[170:300, 190:290] = 100  # mug (mid)
    _draw_ellipse_depth(depth2, 240, 190, 50, 20, 100, h, w)  # mug rim
    depth2[200:300, 360:440] = 60   # jar (close)
    _draw_ellipse_depth(depth2, 400, 200, 45, 15, 58, h, w)  # jar lid
    noise2 = np.random.normal(0, 2.0, (h, w))
    depth2 = np.clip(depth2 + noise2, 15, 245).astype(np.uint8)

    # ========== Scene 3: Beverage Arrangement ==========
    img3 = Image.new('RGB', (w, h), color=(40, 20, 35))
    d3 = ImageDraw.Draw(img3)
    # Dark table surface
    for row in range(h * 2 // 5, h):
        t = (row - h * 2 // 5) / (h * 3 // 5)
        c = int(50 + t * 25)
        d3.line([(0, row), (w, row)], fill=(c - 5, c, c + 5))
    # Soda can 1 (left, close) — red
    d3.rectangle([40, 180, 110, 310], fill=(220, 40, 50), outline=(250, 60, 70), width=2)
    d3.ellipse([38, 170, 112, 200], fill=(200, 30, 40))
    d3.ellipse([38, 295, 112, 320], fill=(180, 30, 35))
    d3.rectangle([50, 220, 100, 270], fill=(240, 60, 70))
    d3.text((55, 235), "COLA", fill=(255, 255, 255))
    # Soda can 2 (center-right, medium) — green
    d3.rectangle([220, 150, 290, 290], fill=(30, 160, 70), outline=(40, 190, 90), width=2)
    d3.ellipse([218, 140, 292, 170], fill=(25, 140, 60))
    d3.ellipse([218, 275, 292, 300], fill=(20, 130, 55))
    d3.rectangle([230, 190, 280, 240], fill=(40, 180, 80))
    d3.text((235, 205), "LIME", fill=(255, 255, 255))
    # Tall energy drink (far right, far) — blue/purple
    d3.rectangle([370, 100, 440, 290], fill=(50, 40, 160), outline=(70, 60, 200), width=2)
    d3.ellipse([368, 90, 442, 115], fill=(60, 50, 180))
    d3.ellipse([368, 278, 442, 298], fill=(40, 30, 140))
    d3.polygon([(380, 160), (430, 160), (405, 200)], fill=(250, 220, 50))  # lightning
    d3.text((385, 220), "ZAP!", fill=(250, 220, 50))
    # Bottle cap on table
    d3.ellipse([160, 280, 195, 310], fill=(200, 200, 210), outline=(150, 150, 160), width=2)
    d3.text((15, 15), "Beverages — Cans & Energy Drink", fill=(200, 200, 200))

    depth3 = np.full((h, w), 220, dtype=np.float32)
    floor_mask3 = y_g > h * 2 // 5
    depth3[floor_mask3] = 180 - (y_g[floor_mask3] - h * 2 // 5) / (h * 3 // 5) * 60
    depth3[180:310, 40:110] = 55    # red can (closest)
    _draw_ellipse_depth(depth3, 75, 185, 37, 15, 53, h, w)
    depth3[150:290, 220:290] = 105  # green can (mid)
    _draw_ellipse_depth(depth3, 255, 155, 37, 15, 103, h, w)
    depth3[100:290, 370:440] = 155  # energy drink (far)
    _draw_ellipse_depth(depth3, 405, 100, 37, 13, 153, h, w)
    _draw_ellipse_depth(depth3, 177, 295, 18, 15, 70, h, w)  # bottle cap
    noise3 = np.random.normal(0, 2.0, (h, w))
    depth3 = np.clip(depth3 + noise3, 15, 245).astype(np.uint8)

    # ========== Scene 4: Lab Workbench ==========
    img4 = Image.new('RGB', (w, h), color=(20, 25, 40))
    d4 = ImageDraw.Draw(img4)
    # Lab bench surface
    for row in range(h // 3, h):
        t = (row - h // 3) / (h * 2 // 3)
        c = int(55 + t * 30)
        d4.line([(0, row), (w, row)], fill=(c - 10, c, c + 10))
    # Erlenmeyer flask (left) — triangular body
    d4.polygon([(80, 280), (160, 280), (120, 150)], fill=(180, 210, 230), outline=(140, 180, 200), width=2)
    d4.rectangle([110, 100, 130, 155], fill=(180, 210, 230))  # neck
    d4.rectangle([105, 90, 135, 105], fill=(100, 100, 110))  # stopper
    # Green liquid inside
    d4.polygon([(90, 260), (150, 260), (120, 190)], fill=(50, 200, 100, 128))
    # Beaker (center)
    d4.rectangle([210, 160, 310, 290], fill=(200, 220, 240), outline=(160, 180, 200), width=2)
    d4.ellipse([208, 150, 312, 180], fill=(200, 220, 240))
    d4.rectangle([215, 220, 305, 280], fill=(240, 180, 60, 128))  # orange liquid
    d4.text((235, 240), "500mL", fill=(100, 80, 40))
    # Test tube rack (right, far)
    d4.rectangle([370, 130, 450, 160], fill=(100, 80, 60))  # rack bar
    for i, col in enumerate([(220, 50, 50), (50, 150, 220), (220, 180, 50), (180, 50, 180)]):
        tx = 380 + i * 18
        d4.rectangle([tx, 100, tx + 10, 160], fill=(200, 220, 240), outline=(180, 200, 220))
        d4.rectangle([tx + 1, 120, tx + 9, 155], fill=col)  # colored liquid
    # Petri dish on bench
    d4.ellipse([290, 260, 370, 310], fill=(230, 230, 240), outline=(200, 200, 210), width=2)
    d4.ellipse([305, 268, 355, 302], fill=(200, 240, 200))  # agar
    d4.text((15, 15), "Laboratory — Flask, Beaker & Test Tubes", fill=(200, 200, 200))

    depth4 = np.full((h, w), 210, dtype=np.float32)
    floor_mask4 = y_g > h // 3
    depth4[floor_mask4] = 170 - (y_g[floor_mask4] - h // 3) / (h * 2 // 3) * 45
    depth4[90:280, 80:160] = 90    # flask (mid-close)
    depth4[150:290, 210:310] = 110  # beaker (mid)
    _draw_ellipse_depth(depth4, 260, 165, 52, 15, 108, h, w)
    depth4[100:160, 370:450] = 160  # test tube rack (far)
    _draw_ellipse_depth(depth4, 330, 285, 40, 25, 75, h, w)  # petri dish (close)
    noise4 = np.random.normal(0, 2.0, (h, w))
    depth4 = np.clip(depth4 + noise4, 15, 245).astype(np.uint8)

    # ========== Scene 5: Electronics Desk ==========
    img5 = Image.new('RGB', (w, h), color=(30, 28, 35))
    d5 = ImageDraw.Draw(img5)
    # Desk surface
    for row in range(h * 2 // 5, h):
        t = (row - h * 2 // 5) / (h * 3 // 5)
        c = int(60 + t * 20)
        d5.line([(0, row), (w, row)], fill=(c, c - 5, c - 10))
    # Smartphone (center, flat on desk, close)
    d5.rounded_rectangle([180, 210, 300, 340], radius=12, fill=(15, 15, 20), outline=(60, 60, 70), width=2)
    d5.rounded_rectangle([188, 220, 292, 325], radius=6, fill=(40, 100, 180))  # screen
    d5.text((200, 260), "15:08", fill=(255, 255, 255))
    d5.text((210, 280), "iPhone", fill=(200, 200, 220))
    # USB cable
    d5.line([(300, 275), (370, 270), (420, 290), (460, 280)], fill=(220, 220, 220), width=3)
    # Wireless earbuds case (left, very close)
    d5.rounded_rectangle([40, 250, 140, 320], radius=20, fill=(240, 240, 245), outline=(200, 200, 210), width=2)
    d5.ellipse([60, 265, 85, 290], fill=(180, 180, 185))
    d5.ellipse([95, 265, 120, 290], fill=(180, 180, 185))
    # Monitor (background, far)
    d5.rectangle([100, 30, 380, 170], fill=(10, 10, 15), outline=(50, 50, 60), width=3)
    d5.rectangle([110, 40, 370, 160], fill=(30, 50, 80))  # screen glow
    d5.text((150, 80), "RGB-Pose Hub", fill=(100, 200, 150))
    d5.text((180, 100), "v2.0.0", fill=(80, 160, 120))
    d5.rectangle([220, 170, 260, 190], fill=(50, 50, 60))  # monitor stand
    d5.text((15, 15), "Tech Desk — Phone, Earbuds & Monitor", fill=(200, 200, 200))

    depth5 = np.full((h, w), 230, dtype=np.float32)
    floor_mask5 = y_g > h * 2 // 5
    depth5[floor_mask5] = 150 - (y_g[floor_mask5] - h * 2 // 5) / (h * 3 // 5) * 40
    depth5[30:190, 100:380] = 200   # monitor (very far)
    depth5[210:340, 180:300] = 60   # phone (close, on desk)
    depth5[250:320, 40:140] = 45    # earbuds case (very close)
    noise5 = np.random.normal(0, 2.0, (h, w))
    depth5 = np.clip(depth5 + noise5, 15, 245).astype(np.uint8)

    # ========== Save all scenes ==========
    scenes = [
        ('sample_rgbd_warehouse.png', img1, depth1, 'Warehouse Box Stack'),
        ('sample_rgbd_kitchen.png', img2, depth2, 'Kitchen Countertop'),
        ('sample_rgbd_beverages.png', img3, depth3, 'Beverage Cans'),
        ('sample_rgbd_laboratory.png', img4, depth4, 'Laboratory Workbench'),
        ('sample_rgbd_techdesk.png', img5, depth5, 'Tech Desk'),
    ]

    for fname, img_rgb, depth_arr, label in scenes:
        rgb_arr = np.array(img_rgb)
        rgbd_arr = np.dstack([rgb_arr, depth_arr])
        img_rgbd = Image.fromarray(rgbd_arr, mode='RGBA')

        out_path = os.path.join(output_dir, fname)
        img_rgbd.save(out_path, 'PNG')
        generated_files.append(out_path)

        # Save the separate depth companion as uint16 millimeters. The alpha
        # channel remains a visualization-only legacy channel; only this
        # explicitly scaled map is used for metric pose estimation.
        depth_pair_path = os.path.join(output_dir, fname.replace('.png', '_depth.png'))
        depth_mm = np.clip(depth_arr.astype(np.float32) * 10.0, 1, 65535).astype(np.uint16)
        Image.fromarray(depth_mm).save(depth_pair_path, 'PNG')

        print(f"  ✓ Generated: {label} → {fname}")

    return generated_files


if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, 'uploads', 'samples')
    create_sample_rgbd_images(output_dir)
