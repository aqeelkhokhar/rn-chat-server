# rn-chat-server

A small Socket.IO server that powers the [my-chat-app](https://github.com/aqeelkhokhar/my-chat-app) React Native client. It handles presence, direct and group messaging, and the signaling that WebRTC voice and video calls need.

## What it does

- Registers each user and broadcasts the list of who is online
- Direct messages, plus group creation and group messaging events for clients that need them
- Call signaling for one to one calls, with group call events available. It relays the WebRTC offer, answer and ICE candidates between peers and handles call, accept, reject and end events

## Events

| Event | Purpose |
| --- | --- |
| `register`, `get_online_users`, `online_users` | Presence |
| `send_message` | Direct and group messages |
| `create_group`, `get_groups` | Group management |
| `call_user`, `accept_call`, `reject_call`, `end_call`, `group_call` | Call control |
| `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate` | WebRTC signaling |

## Run it

```sh
yarn install
yarn start
```

The server listens on the `PORT` environment variable, or 3000 by default. Media is not stored here. The client uploads images straight to cloud storage and only sends the link.

## Author

Built by [Aqeel Ahmad](https://github.com/aqeelkhokhar), Senior Mobile Engineer. I build real time features such as chat, calls and live updates for mobile apps. Portfolio https://aqeel-ahmad-portfolio.vercel.app/
