#!/usr/bin/env python3
"""
Moberino - YouTube Video Metadata Exporter (OAuth version)
Pulls all uploaded videos including unlisted ones from your YouTube channel.

Requirements:
    pip3 install google-api-python-client google-auth-oauthlib

Usage:
    python3 fetch_videos.py
    (needs client_secret.json in the same folder)
"""

import csv
import os
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"]
TOKEN_FILE = "token.json"
CLIENT_SECRET_FILE = "client_secret.json"
OUTPUT_FILE = "moberino_videos.csv"


def get_credentials():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())
    return creds


def get_uploads_playlist_id(youtube):
    response = youtube.channels().list(part="contentDetails", mine=True).execute()
    items = response.get("items", [])
    if not items:
        print("ERROR: No channel found for this account.")
        exit(1)
    return items[0]["contentDetails"]["relatedPlaylists"]["uploads"]


def fetch_all_videos(youtube, playlist_id):
    videos = []
    next_page_token = None

    while True:
        response = youtube.playlistItems().list(
            part="snippet",
            playlistId=playlist_id,
            maxResults=50,
            pageToken=next_page_token,
        ).execute()

        for item in response.get("items", []):
            snippet = item["snippet"]
            video_id = snippet["resourceId"]["videoId"]

            thumbs = snippet.get("thumbnails", {})
            thumb_url = (
                thumbs.get("maxres", {}).get("url")
                or thumbs.get("high", {}).get("url")
                or thumbs.get("medium", {}).get("url")
                or thumbs.get("default", {}).get("url")
                or f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
            )

            videos.append({
                "title": snippet.get("title", ""),
                "video_id": video_id,
                "youtube_url": f"https://www.youtube.com/watch?v={video_id}",
                "thumbnail_url": thumb_url,
                "published_at": snippet.get("publishedAt", ""),
            })

        next_page_token = response.get("nextPageToken")
        if not next_page_token:
            break

        print(f"  Fetched {len(videos)} videos so far...", end="\r")

    return videos


def write_csv(videos):
    fieldnames = ["title", "video_id", "youtube_url", "thumbnail_url", "published_at", "category"]
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for v in videos:
            writer.writerow({**v, "category": ""})
    print(f"Saved {len(videos)} videos to {OUTPUT_FILE}")


def main():
    if not os.path.exists(CLIENT_SECRET_FILE):
        print(f"ERROR: {CLIENT_SECRET_FILE} not found in this folder.")
        print("Download it from Google Cloud Console > Credentials > your OAuth client > Download JSON")
        print(f"Then place it in: {os.path.abspath('.')}")
        exit(1)

    print("Authenticating with Google...")
    creds = get_credentials()
    youtube = build("youtube", "v3", credentials=creds)

    print("Finding your uploads playlist...")
    playlist_id = get_uploads_playlist_id(youtube)

    print("Fetching all videos (including unlisted)...")
    videos = fetch_all_videos(youtube, playlist_id)

    print(f"\nTotal videos found: {len(videos)}")
    write_csv(videos)

    print("\nNext step: Open moberino_videos.csv in Google Sheets and fill in the 'category' column.")


if __name__ == "__main__":
    main()
