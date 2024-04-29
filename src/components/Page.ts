import { html } from "common-tags";

export default function Page(content: string) {
	return html`<!doctype html>
		<html>
			<head>
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="darkreader-lock" />
				<link rel="stylesheet" href="style.css" />
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
				<link
					href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&display=swap"
					rel="stylesheet"
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap"
					rel="stylesheet"
				/>
			</head>

			<body>
				${content}
			</body>
		</html>`;
}
