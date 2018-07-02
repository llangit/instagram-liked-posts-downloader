# Instagram Liked Posts Downloader

Download liked (or all) posts from a specified Instagram profile.

## How to use

Clone and run `npm install`, then execute the downloader with the following command:

```
node instaload.js --u <username> --pw <password> --pr <profile>
```

### Flags

| Flag | Description | Required? |
| --- | --- | --- |
| --user or --u | Instagram username | Yes |
| --password or --pw | Instagram password | Yes |
| --profile or --pr | Profile to download posts from | Yes |
| --postsnumber or --pn | Number of posts to check/download | No. Default is 50 (i.e. the latest 50 posts) |
| --all | Download all posts | No. By default, only liked posts are downloaded |

