#!/usr/bin/env python3
"""
Initialize a new WordPress block with proper structure.
Usage: python init_block.py <block-name> --type [static|dynamic|interactive]
"""

import argparse
import os
import shutil
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).parent.parent

def create_block(block_name: str, block_type: str, output_dir: Path):
    """Create a new block from template."""
    
    # Validate block name
    if not block_name.islower() or ' ' in block_name:
        print("Error: Block name must be lowercase with hyphens (e.g., 'my-block')")
        sys.exit(1)
    
    # Determine template
    templates = {
        'static': 'basic-static',
        'dynamic': 'dynamic-php',
        'interactive': 'interactive'
    }
    
    template_name = templates.get(block_type)
    if not template_name:
        print(f"Error: Invalid block type. Use: static, dynamic, or interactive")
        sys.exit(1)
    
    template_dir = SKILL_DIR / 'assets' / 'block-templates' / template_name
    if not template_dir.exists():
        print(f"Error: Template not found at {template_dir}")
        sys.exit(1)
    
    # Create output directory
    block_dir = output_dir / block_name
    if block_dir.exists():
        print(f"Error: Directory {block_dir} already exists")
        sys.exit(1)
    
    # Copy template
    print(f"Creating {block_type} block: {block_name}")
    shutil.copytree(template_dir, block_dir)
    
    # Update files with block name
    for file_path in block_dir.rglob('*'):
        if file_path.is_file():
            try:
                content = file_path.read_text()
                # Replace placeholders
                content = content.replace('block-name', block_name)
                content = content.replace('namespace', 'my-plugin')  # Update this
                file_path.write_text(content)
            except UnicodeDecodeError:
                pass  # Skip binary files
    
    print(f"✓ Block created at: {block_dir}")
    print(f"\nNext steps:")
    print(f"1. cd {block_dir}")
    print(f"2. Update 'namespace' in files to your plugin/theme namespace")
    print(f"3. npm install")
    print(f"4. npm run build")
    print(f"\nRegister in PHP:")
    print(f"register_block_type( __DIR__ . '/build/{block_name}' );")

def main():
    parser = argparse.ArgumentParser(description='Create a new WordPress block')
    parser.add_argument('name', help='Block name (lowercase, hyphenated)')
    parser.add_argument('--type', choices=['static', 'dynamic', 'interactive'], 
                       default='static', help='Block type')
    parser.add_argument('--output', type=Path, default=Path.cwd(),
                       help='Output directory (default: current directory)')
    
    args = parser.parse_args()
    create_block(args.name, args.type, args.output)

if __name__ == '__main__':
    main()
